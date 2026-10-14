import { homedir } from "node:os"
import path from "node:path"

import { DATA_DIR_ENV, DATA_DIR_NAME } from "../shared/app"

/**
 * Where everything this app keeps on disk lives, under the user's home.
 *
 * The environment variable moves the whole tree. It is read on every call
 * rather than captured once, so that a test can point it somewhere disposable
 * before the first read. That is not a detail: the alternative for a test is
 * `$HOME`, and `homedir()` is resolved at startup by at least one of the
 * runtimes this repo uses, which makes redirecting it from inside the process
 * silently do nothing.
 *
 * Its own module, tiny as it is, so that nothing needing the path has to import
 * a module that might one day reach for `electron`.
 */
export function dataDir(): string {
  return process.env[DATA_DIR_ENV] ?? path.join(homedir(), DATA_DIR_NAME)
}
