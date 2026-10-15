/**
 * The AI analyst's threads with a scripted runner in place of the Agent SDK:
 * a turn's lifecycle, streaming, resuming the session, cancelling, failing
 * and removing — everything but the model.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import type { AiThread } from "../src/shared/api"
import { Analyst, titleOf, type AgentRun } from "../src/main/ai/analyst"
import { describeInput, explainError } from "../src/main/ai/claude"
import { check, finish, section } from "./harness"

const dir = mkdtempSync(path.join(tmpdir(), "finlens-analyst-"))
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A runner the test drives by hand: each turn waits until released. */
const runs: (AgentRun & {
  release: (cost?: number) => void
  fail: (message: string) => void
})[] = []
const runner = (run: AgentRun) =>
  new Promise<{ costUsd: number }>((resolve, reject) => {
    run.signal.addEventListener("abort", () => reject(new Error("aborted")))
    runs.push({
      ...run,
      release: (cost = 0.01) => resolve({ costUsd: cost }),
      fail: (message) => reject(new Error(message)),
    })
  })

const changed: AiThread[] = []
const removed: string[] = []
const events = {
  changed: (thread: AiThread) => changed.push(structuredClone(thread)),
  removed: (id: string) => removed.push(id),
}

/** Waits for the last `changed` push to report the thread idle. */
async function settled(id: string) {
  for (let i = 0; i < 50; i++) {
    const last = changed.filter((each) => each.id === id).at(-1)
    if (last?.status === "idle") return last
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("never settled")
}

try {
  section("A turn")
  const analyst = new Analyst(dir, runner, events)
  const id = await analyst.ask(null, "  Phân tích BTC  ")
  check("answers with the new thread's id", typeof id === "string")
  check(
    "pushes the thread running at once",
    changed.at(-1)?.status === "running"
  )
  check(
    "with the question and an empty answer",
    changed
      .at(-1)
      ?.messages.map((m) => m.role)
      .join() === "user,assistant"
  )
  check(
    "the question is trimmed",
    changed.at(-1)?.messages[0]?.text === "Phân tích BTC"
  )
  check("a new thread starts its session fresh", runs[0]?.resume === null)

  let busy = false
  try {
    await analyst.ask(id, "again")
  } catch {
    busy = true
  }
  check("a running thread refuses a second question", busy)

  runs[0]!.onEvent({ type: "session", sessionId: "s-1" })
  runs[0]!.onEvent({ type: "block" })
  runs[0]!.onEvent({ type: "text", text: "Đang tăng." })
  runs[0]!.onEvent({
    type: "tool",
    name: "get_technicals",
    detail: "key: crypto:BTCUSDT",
  })
  runs[0]!.onEvent({ type: "block" })
  runs[0]!.onEvent({ type: "text", text: "RSI 62." })
  runs[0]!.release(0.02)
  const done = await settled(id)
  const answer = done.messages[1]!
  check(
    "text blocks read as paragraphs",
    answer.text === "Đang tăng.\n\nRSI 62.",
    answer.text
  )
  check("tool calls are recorded", answer.tools[0]?.name === "get_technicals")
  check("the session is kept", done.sessionId === "s-1")
  check("the cost is added", Math.abs(done.costUsd - 0.02) < 1e-9)
  check(
    "the answer keeps its own cost and end",
    answer.costUsd === 0.02 && typeof answer.finishedAt === "string",
    answer
  )

  section("A follow-up")
  await analyst.ask(id, "Còn ETH?")
  check("resumes the thread's session", runs[1]?.resume === "s-1")
  runs[1]!.release(0.01)
  const after = await settled(id)
  check("adds to the same thread", after.messages.length === 4)
  check("costs accumulate", Math.abs(after.costUsd - 0.03) < 1e-9)

  section("Rename")
  await analyst.rename(id, "  BTC   tuần này ")
  check("pushes the new title", changed.at(-1)?.title === "BTC tuần này")
  await analyst.ask(id, "Còn SOL?")
  await analyst.rename(id, "Đổi giữa chừng")
  runs[2]!.release()
  const renamed = await settled(id)
  check(
    "a rename mid-answer survives the turn's save",
    renamed.title === "Đổi giữa chừng",
    renamed.title
  )
  let blank = false
  try {
    await analyst.rename(id, "   ")
  } catch {
    blank = true
  }
  check("a blank title is refused", blank)

  section("Persistence")
  const reread = await new Analyst(dir, runner, events).list()
  check(
    "threads are on disk",
    reread.length === 1 && reread[0]?.messages.length === 6
  )

  section("Failure and cancel")
  const failing = await analyst.ask(null, "Lỗi")
  runs[3]!.fail("401 invalid x-api-key")
  const failed = await settled(failing)
  check(
    "an error is kept on the answer",
    failed.messages[1]?.error === "401 invalid x-api-key",
    failed.messages[1]
  )
  check("and the thread is idle again", failed.status === "idle")

  const cancelled = await analyst.ask(null, "Dừng")
  await analyst.cancel(cancelled)
  const stopped = await settled(cancelled)
  check(
    "a cancel reads as stopped, not as an error",
    stopped.messages[1]?.error === "Đã dừng.",
    stopped.messages[1]
  )

  section("A crash mid-answer")
  const orphan = await analyst.ask(null, "Mồ côi")
  const fresh = await new Analyst(dir, runner, events).list()
  check(
    "another process reads a running thread as idle",
    fresh.find((each) => each.id === orphan)?.status === "idle"
  )
  runs.at(-1)!.release()
  await settled(orphan)

  section("Remove")
  const doomed = await analyst.ask(null, "Xoá")
  await analyst.remove(doomed)
  await tick()
  check("pushes the removal", removed.includes(doomed))
  check("aborts its turn", runs.at(-1)!.signal.aborted)
  await new Promise((resolve) => setTimeout(resolve, 20))
  check(
    "and it stays removed",
    !(await analyst.list()).some((each) => each.id === doomed)
  )

  let empty = false
  try {
    await analyst.ask(null, "   ")
  } catch {
    empty = true
  }
  check("an empty question is refused", empty)

  section("Helpers")
  check(
    "a short title is the question",
    titleOf("Phân tích FPT") === "Phân tích FPT"
  )
  const long = titleOf(
    "Phân tích kỹ thuật cổ phiếu FPT trên khung ngày và khung tuần, kèm kịch bản giao dịch"
  )
  check(
    "a long one is cut at a word",
    long.length <= 61 && long.endsWith("…"),
    long
  )
  check(
    "describeInput is one line",
    describeInput({ keys: ["a", "b"], interval: "1d" }) ===
      "keys: a, b · interval: 1d"
  )
  check(
    "an auth failure explains itself",
    explainError("401 Unauthorized").includes("/login")
  )
  check("anything else is left alone", explainError("boom") === "boom")
} finally {
  rmSync(dir, { recursive: true, force: true })
}

finish()
