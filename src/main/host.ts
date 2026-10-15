/**
 * Everything `ipc.ts` needs from Electron itself — a push to the windows, the
 * packaged binary's path — and nothing that reads or writes the app's own data.
 * `electron-ipc.ts` implements it; a test hands in a fake.
 *
 * Free of `electron`, like the rest of what `ipc.ts` imports, so the tests can
 * import the handlers without it. A handler that needs something new from
 * Electron adds a member here rather than importing `electron` into `ipc.ts`.
 */
export type Host = {
  /** A push event, to every window at once. */
  send: (channel: string, payload: unknown) => void

  /**
   * The Claude Code binary the Agent SDK should run, or undefined for the
   * SDK's own lookup. Only the packaged app needs this: there the binary sits
   * in `app.asar.unpacked`, where the SDK's lookup does not think to look.
   */
  claudeExecutable: string | undefined

  /** This build's version. */
  version: string
}
