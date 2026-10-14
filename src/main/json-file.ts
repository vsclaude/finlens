import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * One JSON document on disk, read once and written whole.
 *
 * Writes go to a temporary file beside the target and are renamed over it, so
 * a crash mid-write leaves the previous document rather than half of the new
 * one. They are also chained, one after another: two handlers saving at once
 * would otherwise race their renames and the earlier state could land last.
 *
 * A file that is missing or does not parse reads as `fallback` — a corrupt
 * settings file should cost somebody their settings, not the app's start. The
 * unparseable file is left where it is until the next write replaces it.
 */
export class JsonFile<T> {
  private value: T | undefined
  private queue: Promise<void> = Promise.resolve()
  private updates: Promise<unknown> = Promise.resolve()

  constructor(
    readonly file: string,
    private readonly fallback: () => T
  ) {}

  async read(): Promise<T> {
    if (this.value !== undefined) return this.value
    try {
      this.value = JSON.parse(await readFile(this.file, "utf8")) as T
    } catch {
      this.value = this.fallback()
    }
    return this.value
  }

  /** Replaces the document. Resolves once it is on disk. */
  write(next: T): Promise<void> {
    this.value = next
    const text = `${JSON.stringify(next, null, 2)}\n`
    const run = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.${process.pid}.tmp`
      await writeFile(temp, text, "utf8")
      await rename(temp, this.file)
    })
    // The chain survives a failed write; the caller still sees the failure.
    this.queue = run.catch(() => {})
    return run
  }

  /**
   * Reads, applies `change`, writes, and answers with what was written.
   *
   * Updates run one at a time, each `change` seeing the one before it. Two
   * overlapping updates would otherwise both read the same document and the
   * second write would undo the first — which is how a thread removed while
   * its answer was finishing came back from the dead.
   */
  update(change: (current: T) => T): Promise<T> {
    const run = this.updates.then(async () => {
      const next = change(await this.read())
      await this.write(next)
      return next
    })
    // The chain survives a refused change; the caller still sees the throw.
    this.updates = run.catch(() => {})
    return run
  }
}
