import { randomUUID } from "node:crypto"
import path from "node:path"

import type { AiMessage, AiThread } from "../../shared/api"
import { JsonFile } from "../json-file"

/** What a runner reports while it works. */
export type AgentEvent =
  | { type: "session"; sessionId: string }
  /** A new block of text is starting — the one before it ended at a tool
   * call, and the two read as paragraphs rather than one run-on line. */
  | { type: "block" }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail: string }

export type AgentRun = {
  prompt: string
  /** The session to continue, null for a new one. */
  resume: string | null
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void
}

/**
 * One turn with the model. Resolves with what the turn cost; throws with a
 * message fit to show the user. `claude.ts` is the real one, over the Agent
 * SDK; `test/analyst.ts` hands in a script.
 */
export type AgentRunner = (run: AgentRun) => Promise<{ costUsd: number }>

export type AnalystEvents = {
  changed: (thread: AiThread) => void
  removed: (threadId: string) => void
}

/** How often a streaming answer is pushed to the windows. Every token would
 * be hundreds of IPC messages a second, each re-rendering the transcript. */
const PUSH_EVERY_MS = 80

/**
 * The AI analyst's threads — `ai-threads.json` — and the turns running in
 * them.
 *
 * A turn streams into a working copy of its thread that is pushed to the
 * windows as it grows and written to disk once, when the turn ends: a disk
 * write per token would be the slowest part of the app.
 *
 * Free of `electron` and of the SDK; everything model-shaped is the runner's.
 */
export class Analyst {
  private readonly file: JsonFile<AiThread[]>
  private readonly running = new Map<string, AbortController>()
  /** The working copy of each running thread, which is what the turn writes
   * over the saved one when it ends — so a rename has to reach it too. */
  private readonly live = new Map<string, AiThread>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    dir: string,
    private readonly runner: AgentRunner,
    private readonly events: AnalystEvents
  ) {
    this.file = new JsonFile(path.join(dir, "ai-threads.json"), () => [])
  }

  /**
   * Newest first. A thread saved as running by a process that is no longer
   * here — the app quit or crashed mid-answer — reads as idle, or it would
   * show a spinner forever.
   */
  async list(): Promise<AiThread[]> {
    const threads = await this.file.read()
    return threads
      .map((thread) =>
        thread.status === "running" && !this.running.has(thread.id)
          ? { ...thread, status: "idle" as const }
          : thread
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async ask(threadId: string | null, prompt: string): Promise<string> {
    const text = prompt.trim()
    if (!text) throw new Error("Câu hỏi trống")
    if (threadId && this.running.has(threadId)) {
      throw new Error("AI vẫn đang trả lời trong cuộc hội thoại này")
    }

    const now = new Date().toISOString()
    const existing = threadId
      ? (await this.file.read()).find((each) => each.id === threadId)
      : undefined
    if (threadId && !existing) throw new Error("Không tìm thấy cuộc hội thoại")

    const question: AiMessage = {
      id: randomUUID(),
      role: "user",
      text,
      tools: [],
      createdAt: now,
    }
    const answer: AiMessage = {
      id: randomUUID(),
      role: "assistant",
      text: "",
      tools: [],
      createdAt: now,
    }
    const thread: AiThread = existing
      ? structuredClone(existing)
      : {
          id: randomUUID(),
          title: titleOf(text),
          sessionId: null,
          status: "idle",
          messages: [],
          costUsd: 0,
          createdAt: now,
          updatedAt: now,
        }
    thread.messages.push(question, answer)
    thread.status = "running"
    thread.updatedAt = now

    const controller = new AbortController()
    this.running.set(thread.id, controller)
    this.live.set(thread.id, thread)
    await this.save(thread, !existing)
    this.events.changed(thread)

    // Not awaited: the call answers with the id at once and the answer
    // arrives through `changed`.
    void this.run(thread, answer, text, controller)
    return thread.id
  }

  private async run(
    thread: AiThread,
    answer: AiMessage,
    prompt: string,
    controller: AbortController
  ): Promise<void> {
    try {
      const { costUsd } = await this.runner({
        prompt,
        resume: thread.sessionId,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "session") thread.sessionId = event.sessionId
          else if (event.type === "block") {
            if (answer.text && !answer.text.endsWith("\n\n")) {
              answer.text += "\n\n"
            }
          } else if (event.type === "text") answer.text += event.text
          else answer.tools.push({ name: event.name, detail: event.detail })
          this.schedulePush(thread)
        },
      })
      thread.costUsd += costUsd
      answer.costUsd = costUsd
    } catch (error) {
      answer.error = controller.signal.aborted
        ? "Đã dừng."
        : error instanceof Error
          ? error.message
          : String(error)
    } finally {
      this.running.delete(thread.id)
      this.live.delete(thread.id)
      thread.status = "idle"
      thread.updatedAt = new Date().toISOString()
      answer.finishedAt = thread.updatedAt
      const timer = this.timers.get(thread.id)
      if (timer) clearTimeout(timer)
      this.timers.delete(thread.id)
      // A thread removed mid-answer stays removed.
      if (await this.save(thread)) this.events.changed(thread)
    }
  }

  private schedulePush(thread: AiThread) {
    if (this.timers.has(thread.id)) return
    this.timers.set(
      thread.id,
      setTimeout(() => {
        this.timers.delete(thread.id)
        if (this.running.has(thread.id)) this.events.changed(thread)
      }, PUSH_EVERY_MS)
    )
  }

  /** Writes the thread over its saved self, or adds it when `create`.
   * Answers false when it had been removed meanwhile. */
  private async save(thread: AiThread, create = false): Promise<boolean> {
    let kept = true
    await this.file.update((threads) => {
      const at = threads.findIndex((each) => each.id === thread.id)
      if (at >= 0) {
        const next = [...threads]
        next[at] = structuredClone(thread)
        return next
      }
      if (create) return [...threads, structuredClone(thread)]
      kept = false
      return threads
    })
    return kept
  }

  async cancel(threadId: string): Promise<void> {
    this.running.get(threadId)?.abort()
  }

  /** Leaves `updatedAt` alone: a rename is not news, and moving the thread to
   * the top of the list under the cursor would be. */
  async rename(threadId: string, title: string): Promise<void> {
    const text = title.trim().replace(/\s+/g, " ").slice(0, 120)
    if (!text) throw new Error("Tên trống")
    const working = this.live.get(threadId)
    if (working) working.title = text
    let renamed: AiThread | undefined
    await this.file.update((threads) =>
      threads.map((each) =>
        each.id === threadId ? (renamed = { ...each, title: text }) : each
      )
    )
    if (!renamed) throw new Error("Không tìm thấy cuộc hội thoại")
    this.events.changed(working ?? renamed)
  }

  async remove(threadId: string): Promise<void> {
    this.running.get(threadId)?.abort()
    await this.file.update((threads) =>
      threads.filter((each) => each.id !== threadId)
    )
    this.events.removed(threadId)
  }

  /** On quit: a turn left running holds a child process open. */
  cancelAll(): void {
    for (const controller of this.running.values()) controller.abort()
  }
}

/** The first line of the first question, cut at a word near 60 characters. */
export function titleOf(prompt: string): string {
  const line = prompt.split("\n")[0]!.trim()
  if (line.length <= 60) return line
  const cut = line.slice(0, 60)
  const space = cut.lastIndexOf(" ")
  return `${cut.slice(0, space > 30 ? space : 60)}…`
}
