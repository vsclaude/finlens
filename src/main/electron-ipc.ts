import { createRequire } from "node:module"

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  type OpenDialogOptions,
} from "electron"

import type { Host } from "./host"
import { createIpc } from "./ipc"

/**
 * Where the Agent SDK's Claude Code binary is in a packaged app.
 *
 * The SDK finds it with `require.resolve`, which inside a packaged app answers
 * with a path in `app.asar` — an archive the OS cannot execute from.
 * electron-builder unpacks the binary beside it (`asarUnpack` in
 * package.json), so the path is the same with `.unpacked` on the archive. In
 * dev nothing is archived and the SDK's own lookup is right.
 */
function claudeExecutable(): string | undefined {
  if (!app.isPackaged) return undefined
  const binary = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${process.platform === "win32" ? ".exe" : ""}`
  try {
    return createRequire(__filename)
      .resolve(binary)
      .replace(/app\.asar([\\/])/, "app.asar.unpacked$1")
  } catch {
    return undefined
  }
}

/**
 * Puts every handler in `ipc.ts` on `ipcMain`, with Electron as its host.
 *
 * Push events go to every window rather than the caller, so a second window
 * never draws stale state. Dialogs are parented to the main window when there
 * is one, so a picker is modal to it rather than a sheet the user can lose
 * behind it.
 */
export function registerIpc(getWindow: () => BrowserWindow | null) {
  const host: Host = {
    send(channel, payload) {
      for (const window of BrowserWindow.getAllWindows()) {
        // Gone during shutdown; its last event has nowhere to go.
        if (window.isDestroyed()) continue
        window.webContents.send(channel, payload)
      }
    },

    async pickDirectory() {
      const options: OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
      }
      const window = getWindow()
      const result = await (window
        ? dialog.showOpenDialog(window, options)
        : dialog.showOpenDialog(options))
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },

    async reveal(target) {
      shell.showItemInFolder(target)
    },

    encrypt: (text) => safeStorage.encryptString(text).toString("base64"),
    decrypt: (sealed) =>
      safeStorage.decryptString(Buffer.from(sealed, "base64")),

    claudeExecutable: claudeExecutable(),

    version: app.getVersion(),
  }

  const ipc = createIpc(host)
  for (const [channel, handler] of ipc.handlers) {
    ipcMain.handle(channel, (event, ...args: unknown[]) =>
      handler(event, ...args)
    )
  }

  return ipc
}
