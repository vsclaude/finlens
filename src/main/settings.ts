import path from "node:path"

import { DEFAULT_SETTINGS, type Settings } from "../shared/api"
import { JsonFile } from "./json-file"

/**
 * `settings.json` under the data directory.
 *
 * Read through `DEFAULT_SETTINGS` so a key added in a later version reads as
 * its default rather than `undefined`, and written as a whole document — a key
 * this build does not know (one a newer build wrote) is kept rather than
 * dropped, so going back a version does not lose it.
 */
export class SettingsStore {
  private readonly file: JsonFile<Partial<Settings>>

  constructor(dir: string) {
    this.file = new JsonFile(path.join(dir, "settings.json"), () => ({}))
  }

  async all(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...(await this.file.read()) }
  }

  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    return (await this.all())[key]
  }

  async set<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting: ${key}`)
    await this.file.update((current) => ({ ...current, [key]: value }))
  }
}
