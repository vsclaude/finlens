import { create } from "zustand"

import type { InstrumentKey, Interval } from "@shared/api"

/** What the chart page opens on, and goes back to from a key that fails. */
export const DEFAULT_KEY: InstrumentKey = "crypto:BTCUSDT"

export type Page = "dashboard" | "market" | "chart" | "portfolio" | "ai"

type NavState = {
  page: Page
  /** What the chart page shows; kept here so leaving the page keeps it. */
  chartKey: InstrumentKey
  chartInterval: Interval
  /** The open AI thread; null is a new, empty one. */
  threadId: string | null
  go: (page: Page) => void
  openChart: (key: InstrumentKey, interval?: Interval) => void
  openThread: (threadId: string | null) => void
  /** Starts a thread with `prompt` and shows it. */
  ask: (prompt: string) => Promise<void>
}

/**
 * Which page is showing, and what each page is pointed at. A store rather
 * than a router: there are five pages and no URLs anybody will ever type.
 */
export const useNav = create<NavState>((set) => ({
  page: "dashboard",
  chartKey: DEFAULT_KEY,
  chartInterval: "1d",
  threadId: null,
  go: (page) => set({ page }),
  openChart: (chartKey, interval) =>
    set((state) => ({
      page: "chart",
      chartKey,
      chartInterval: interval ?? state.chartInterval,
    })),
  openThread: (threadId) => set({ page: "ai", threadId }),
  async ask(prompt) {
    set({ page: "ai" })
    const threadId = await window.desktop.askAi(null, prompt)
    set({ threadId })
  },
}))
