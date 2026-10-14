import { mkdir } from "node:fs/promises"
import path from "node:path"

import type { ApiKeyStore } from "../api-key-store"
import type { SettingsStore } from "../settings"
import type { AgentEvent, AgentRunner } from "./analyst"
import { systemPrompt } from "./prompt"
import { analystTools, SERVER, type ToolContext } from "./tools"

/** The only built-ins the analyst gets: reading the web for news. Everything
 * else Claude Code ships — a shell, file edits — has no business here. */
const BUILT_INS = ["WebSearch", "WebFetch"]

/** A ceiling on one answer's tool round-trips, so a confused model cannot
 * loop on the user's bill. A thorough portfolio review needs about ten. */
const MAX_TURNS = 30

/** One line of a tool's input, for the transcript. */
export function describeInput(input: unknown): string {
  if (!input || typeof input !== "object") return ""
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}: ${value.join(", ")}`
        : typeof value === "object"
          ? `${key}: ${JSON.stringify(value)}`
          : `${key}: ${String(value)}`
    )
    .join(" · ")
    .slice(0, 160)
}

/**
 * What an SDK failure means for somebody who has never heard of the SDK. An
 * auth failure is by far the most likely one on a first run, and its raw text
 * names environment variables the user never set.
 */
export function explainError(raw: string): string {
  const text = raw.trim() || "Lỗi không xác định"
  if (/auth|api[ _-]?key|log ?in|401|credential|unauthori[sz]ed/i.test(text)) {
    return `${text}\n\nChưa xác thực được với Claude. Nhập Anthropic API key trong Cài đặt, hoặc đăng nhập Claude Code trên máy này (\`claude\` → /login).`
  }
  if (/ENOENT|spawn/i.test(text)) {
    return `${text}\n\nKhông khởi động được Claude Code. Thử cài lại ứng dụng.`
  }
  return text
}

/** The environment every Claude Code process this app starts runs in. */
export function sdkEnv(apiKey: string | null, version: string) {
  return {
    ...process.env,
    // A saved key wins over the environment's; with neither, Claude Code
    // falls back to the user's own `claude` login.
    ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
    CLAUDE_AGENT_SDK_CLIENT_APP: `finlens/${version}`,
  }
}

/**
 * The real runner: one Agent SDK `query()` per turn, resumed from the
 * thread's session so a follow-up has the conversation behind it.
 *
 * The SDK is loaded on first use rather than at startup — it is the largest
 * module in main by far, and most launches never ask the analyst anything.
 *
 * Isolated from whatever Claude Code configuration the user has for coding:
 * no settings files, no CLAUDE.md, no MCP servers but our own, a working
 * directory of its own under the data dir. A permission mode of `dontAsk`
 * means anything not on the allow-list is refused rather than prompted —
 * there is nobody at a terminal to answer a prompt.
 */
export function createClaudeRunner(deps: {
  dataDir: string
  context: ToolContext
  settings: SettingsStore
  apiKeys: ApiKeyStore
  executable: string | undefined
  version: string
}): AgentRunner {
  return async ({ prompt, resume, signal, onEvent }) => {
    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    const cwd = path.join(deps.dataDir, "ai")
    await mkdir(cwd, { recursive: true })

    const [model, effort, language, baseCurrency, apiKey] = await Promise.all([
      deps.settings.get("aiModel"),
      deps.settings.get("aiEffort"),
      deps.settings.get("aiLanguage"),
      deps.settings.get("baseCurrency"),
      deps.apiKeys.get(),
    ])

    const abortController = new AbortController()
    if (signal.aborted) abortController.abort()
    signal.addEventListener("abort", () => abortController.abort(), {
      once: true,
    })

    const stderr: string[] = []
    const errors: string[] = []
    let costUsd = 0

    const query = sdk.query({
      prompt,
      options: {
        abortController,
        cwd,
        model,
        // Null for a model that takes no level: the picker never pairs one
        // with a level it does not accept (`effortFor`).
        ...(effort ? { effort } : {}),
        systemPrompt: systemPrompt({
          language,
          baseCurrency,
          today: new Date().toISOString().slice(0, 10),
        }),
        tools: BUILT_INS,
        mcpServers: { [SERVER]: analystTools(sdk, deps.context) },
        allowedTools: [...BUILT_INS, `mcp__${SERVER}`],
        permissionMode: "dontAsk",
        settingSources: [],
        strictMcpConfig: true,
        includePartialMessages: true,
        maxTurns: MAX_TURNS,
        ...(resume ? { resume } : {}),
        ...(deps.executable
          ? { pathToClaudeCodeExecutable: deps.executable }
          : {}),
        env: sdkEnv(apiKey, deps.version),
        stderr: (data) => {
          stderr.push(data)
          if (stderr.length > 40) stderr.shift()
        },
      },
    })

    const emit = (event: AgentEvent) => {
      if (!signal.aborted) onEvent(event)
    }

    let session: string | null = null
    try {
      for await (const message of query) {
        if (session === null && "session_id" in message && message.session_id) {
          session = message.session_id
          emit({ type: "session", sessionId: session })
        }
        // A subagent's stream is not the answer; nothing here starts one, but
        // the filter is what keeps it out if a future tool does.
        if ("parent_tool_use_id" in message && message.parent_tool_use_id) {
          continue
        }
        if (message.type === "stream_event") {
          const event = message.event
          if (
            event.type === "content_block_start" &&
            event.content_block.type === "text"
          ) {
            emit({ type: "block" })
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            emit({ type: "text", text: event.delta.text })
          }
        } else if (message.type === "assistant") {
          if (message.error) errors.push(String(message.error))
          for (const block of message.message.content) {
            if (block.type === "tool_use") {
              emit({
                type: "tool",
                name: block.name.replace(`mcp__${SERVER}__`, ""),
                detail: describeInput(block.input),
              })
            }
          }
        } else if (message.type === "result") {
          costUsd = message.total_cost_usd ?? 0
          if (message.subtype !== "success") {
            errors.push(
              message.subtype === "error_max_turns"
                ? "Đã chạm giới hạn số bước phân tích."
                : message.errors.join("\n") || message.subtype
            )
          } else if (message.is_error) {
            errors.push(message.result)
          }
        }
      }
    } catch (error) {
      if (signal.aborted) throw error
      errors.push(error instanceof Error ? error.message : String(error))
    }

    if (errors.length) {
      const detail = errors.join("\n") || stderr.join("").slice(-800)
      throw new Error(explainError(detail))
    }
    return { costUsd }
  }
}
