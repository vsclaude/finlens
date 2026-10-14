import { create } from "zustand"

import { DEFAULT_SETTINGS, type Settings } from "@shared/api"

type SettingsState = Settings & {
  loaded: boolean
  load: () => Promise<void>
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

/**
 * The renderer's copy of `settings.json`. Starts on the defaults so the first
 * frame has something to draw, and is the one place a setting is written from
 * — optimistically, since main only ever stores what it was given.
 */
export const useSettings = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]
    const values = await Promise.all(
      keys.map((key) => window.desktop.getSetting(key))
    )
    set({
      ...Object.fromEntries(keys.map((key, i) => [key, values[i]])),
      loaded: true,
    })
  },

  async set(key, value) {
    set({ [key]: value } as Partial<SettingsState>)
    await window.desktop.setSetting(key, value)
  },
}))
