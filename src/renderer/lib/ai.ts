import { create } from "zustand"

import type { AiThread } from "@shared/api"

type AiState = {
  threads: AiThread[]
  load: () => Promise<void>
  /** Follows `threadChanged` / `threadRemoved`. Returns the unsubscribe. */
  listen: () => () => void
}

function upsert(threads: AiThread[], thread: AiThread): AiThread[] {
  const rest = threads.filter((each) => each.id !== thread.id)
  return [thread, ...rest].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
}

/** A whole thread as one Markdown document, for the clipboard. */
export function threadMarkdown(thread: AiThread): string {
  const parts = [`# ${thread.title}`]
  for (const message of thread.messages) {
    if (message.role === "user") {
      parts.push(`## Hỏi\n\n${message.text}`)
    } else if (message.text || message.error) {
      parts.push(
        `## FinLens Analyst\n\n${[message.text, message.error && `> ${message.error}`].filter(Boolean).join("\n\n")}`
      )
    }
  }
  return parts.join("\n\n") + "\n"
}

/**
 * The analyst's threads, newest first. A streaming answer arrives as the
 * whole thread, pushed a few times a second by main.
 */
export const useAi = create<AiState>((set) => ({
  threads: [],
  async load() {
    set({ threads: await window.desktop.listThreads() })
  },
  listen() {
    const offChanged = window.desktop.onThreadChanged((thread) =>
      set((state) => ({ threads: upsert(state.threads, thread) }))
    )
    const offRemoved = window.desktop.onThreadRemoved((id) =>
      set((state) => ({
        threads: state.threads.filter((each) => each.id !== id),
      }))
    )
    return () => {
      offChanged()
      offRemoved()
    }
  },
}))
