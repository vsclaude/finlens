import path from "node:path"

import type { Host } from "./host"
import { JsonFile } from "./json-file"

type Document = { anthropicApiKey?: string }

/**
 * `api-key.json`: the Anthropic API key, encrypted by the OS keychain through
 * `host` (Electron's `safeStorage`) — kept out of `settings.json`, which the
 * renderer reads whole and anyone might paste into a bug report.
 *
 * A value that no longer decrypts (the keychain was reset, the file was copied
 * from another machine) reads as no key rather than as an error.
 */
export class ApiKeyStore {
  private readonly file: JsonFile<Document>

  constructor(
    dir: string,
    private readonly host: Pick<Host, "encrypt" | "decrypt">
  ) {
    this.file = new JsonFile(path.join(dir, "api-key.json"), () => ({}))
  }

  async get(): Promise<string | null> {
    const stored = (await this.file.read()).anthropicApiKey
    if (!stored) return null
    try {
      return this.host.decrypt(stored) || null
    } catch {
      return null
    }
  }

  async set(key: string | null): Promise<void> {
    const trimmed = key?.trim()
    await this.file.update((current) => {
      const next = { ...current }
      if (trimmed) next.anthropicApiKey = this.host.encrypt(trimmed)
      else delete next.anthropicApiKey
      return next
    })
  }
}
