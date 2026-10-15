import { mkdir } from "node:fs/promises"
import path from "node:path"

import { readModel, type AgentModel } from "../../shared/ai-models"
import { sdkEnv } from "./claude"

/**
 * A spawn that never answers must not leave the picker waiting; long enough
 * for the CLI to come up on a cold cache.
 */
const TIMEOUT_MS = 15_000

/**
 * Which models the analyst's Claude Code offers, asked of the CLI rather than
 * written down: the list is a property of the account behind it, so a written
 * one either offers a model the account cannot use — a turn that fails after
 * the question is typed — or hides one it is paying for.
 *
 * `supportedModels()` is a control request over the SDK's own channel and is
 * answered out of what the CLI knows about the account: a process, no tokens.
 * The prompt is an iterable that never yields, so the process comes up,
 * answers and is closed without a turn ever starting.
 *
 * The in-flight promise is held for the run, so two windows opening a picker
 * share one process; a failure is not, so a login made after launch is found.
 */
export function createModelLister(deps: {
  dataDir: string
  executable: string | undefined
  version: string
}) {
  let asking: Promise<AgentModel[]> | null = null

  async function ask(): Promise<AgentModel[]> {
    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    const cwd = path.join(deps.dataDir, "ai")
    await mkdir(cwd, { recursive: true })
    const held = new AbortController()

    const nothing: AsyncIterable<never> = {
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<never, undefined>>((resolve) => {
            held.signal.addEventListener(
              "abort",
              () => resolve({ done: true, value: undefined }),
              { once: true }
            )
          }),
      }),
    }

    const conversation = sdk.query({
      prompt: nothing,
      options: {
        abortController: held,
        cwd,
        settingSources: [],
        strictMcpConfig: true,
        ...(deps.executable
          ? { pathToClaudeCodeExecutable: deps.executable }
          : {}),
        env: sdkEnv(deps.version),
      },
    })

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const models = await Promise.race([
        conversation.supportedModels(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`No answer in ${TIMEOUT_MS}ms`)),
            TIMEOUT_MS
          )
        }),
      ])
      return models.map(readModel)
    } finally {
      clearTimeout(timer)
      // Both, in this order: the abort is what the prompt above waits on, and
      // `return()` is what tears the process down.
      held.abort()
      await conversation.return?.(undefined).catch(() => {})
    }
  }

  return {
    list(): Promise<AgentModel[]> {
      asking ??= ask().catch((error: unknown) => {
        // Logged because the fallback list is silent otherwise.
        console.error("Could not ask Claude Code which models it has", error)
        asking = null
        return []
      })
      return asking
    },
  }
}
