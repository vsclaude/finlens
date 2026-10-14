import { create } from "zustand"

import type { WatchItem } from "@shared/api"

type WatchlistState = {
  items: WatchItem[]
  load: () => Promise<void>
  /** Follows `watchlistChanged`. Returns the unsubscribe. */
  listen: () => () => void
}

/**
 * The watchlist as main last said it was. Writes go straight to
 * `window.desktop` and come back through the push, whichever window made them.
 */
export const useWatchlist = create<WatchlistState>((set) => ({
  items: [],
  async load() {
    set({ items: await window.desktop.listWatchlist() })
  },
  listen() {
    return window.desktop.onWatchlistChanged((items) => set({ items }))
  },
}))
