import path from "node:path"

import { BrowserWindow, app, shell } from "electron"

import { APP_NAME } from "../shared/app"
import { registerIpc } from "./electron-ipc"
import { installMenu } from "./menu"
import { APP_ORIGIN, registerAppScheme, serveApp } from "./protocol"

/** Set by scripts/dev.mjs; absent in a packaged app. */
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

/** Where `vite build` leaves the renderer, relative to `dist-electron/`. */
const RENDERER_DIST = path.join(__dirname, "..", "dist-renderer")

/**
 * The master icon electron-builder converts into the platform formats it needs
 * when packaging. Only reachable in dev — `resources/` is not in the packaged
 * `files`, and a packaged app takes its icon from the bundle.
 */
const DEV_ICON = path.join(__dirname, "..", "resources", "icon.png")

/**
 * The window's first-paint colour: the dark `--background` in
 * `styles/globals.css`, the one number in this file that has to follow it.
 * Matching it keeps the first frame from flashing white.
 */
const BACKGROUND = "#1b1c1f"

/**
 * Packaging sets this from `build.productName`, but a dev run reads
 * `package.json` straight from disk, where the app has its slug. It has to
 * happen before `whenReady`: the default menu is built from `app.name`, and
 * `userData` is derived from it.
 */
app.setName(APP_NAME)

/**
 * Where the app itself lives — the one place navigation is allowed to go.
 *
 * Compared by scheme and host rather than by `origin`: Node's URL parser
 * reports `null` for the origin of any scheme it does not know, so two
 * unrelated `app://` URLs would compare equal.
 */
const HOME = new URL(DEV_SERVER_URL ?? APP_ORIGIN)

/**
 * The schemes worth handing to the OS. Not a blanket allow: a `file:` or
 * third-party-app URL reaching `shell.openExternal` asks the OS to open
 * something the user never chose.
 */
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"])

function openExternal(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (!EXTERNAL_SCHEMES.has(parsed.protocol)) return
  void shell.openExternal(url)
}

function isHome(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === HOME.protocol && parsed.host === HOME.host
  } catch {
    return false
  }
}

let mainWindow: BrowserWindow | null = null

function rendererUrl(): string {
  return DEV_SERVER_URL ?? `${APP_ORIGIN}/index.html`
}

/**
 * The two ways a window can leave the app, both handed to the browser: a
 * `window.open`, and a plain link click — which is a *navigation*, and left
 * alone would replace the app with that page, with no chrome to come back by.
 */
function keepInside(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: "deny" }
  })

  window.webContents.on("will-navigate", (details) => {
    // The app's own navigation — a dev-server reload is one — goes through.
    if (isHome(details.url)) return
    details.preventDefault()
    openExternal(details.url)
  })
}

// Privileges have to be declared before the app is ready, so this runs at
// module scope rather than inside `whenReady`.
registerAppScheme()

const ipc = registerIpc(() => mainWindow)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: BACKGROUND,
    show: false,
    // Windows and Linux draw the window/taskbar icon from here. macOS ignores
    // it, and a packaged build has the icon in its own resources.
    ...(DEV_SERVER_URL && process.platform !== "darwin"
      ? { icon: DEV_ICON }
      : {}),
    // macOS only: drop the separate title bar and let the app's own header
    // stand in for it, with the traffic lights inset into it. Windows and
    // Linux keep their native frame, which is what their users expect.
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          // Centres the lights in the header's 44px.
          trafficLightPosition: { x: 18, y: 16 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Showing the window only once it has painted avoids a blank frame.
  mainWindow.once("ready-to-show", () => mainWindow?.show())
  mainWindow.on("closed", () => {
    mainWindow = null
  })
  keepInside(mainWindow)

  // In dev, the renderer's own console — including an uncaught exception,
  // which Chromium logs before the page goes blank — is mirrored into this
  // process' terminal. Packaged builds skip it: nobody is watching.
  if (DEV_SERVER_URL) {
    mainWindow.webContents.on("console-message", (event) => {
      const { level, message, lineNumber, sourceId } = event
      const at = sourceId ? ` (${sourceId}:${lineNumber})` : ""
      console.log(`[renderer:${level}] ${message}${at}`)
    })
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error("[renderer] process gone:", details.reason)
    })
  }

  void mainWindow.loadURL(rendererUrl())
}

void app.whenReady().then(() => {
  // In dev the app runs inside the stock Electron bundle, so the dock shows
  // Electron's atom until it is replaced at runtime.
  if (DEV_SERVER_URL && process.platform === "darwin") {
    app.dock?.setIcon(DEV_ICON)
  }

  if (!DEV_SERVER_URL) serveApp(RENDERER_DIST)
  // Before the window, so the menu bar is never Electron's default one.
  installMenu(() => mainWindow)
  createWindow()

  app.on("activate", () => {
    // macOS: clicking the dock icon reopens the window.
    if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  })
})

app.on("window-all-closed", () => {
  // macOS apps conventionally stay running with no windows; every other
  // platform quits.
  if (process.platform !== "darwin") app.quit()
})

// An answer still streaming holds a Claude Code child process open; aborting
// is synchronous, and the SDK reaps the process on its own.
app.on("before-quit", () => ipc.analyst.cancelAll())

/*
 * Something to stop on quit — a child process, a server, a watcher? Electron
 * does not wait for promises in `before-quit`, so defer the quit, await the
 * cleanup under a timeout, then `app.quit()` again behind a guard:
 *
 *   let cleanedUp = false
 *   app.on("before-quit", (event) => {
 *     if (cleanedUp) return
 *     event.preventDefault()
 *     void Promise.race([cleanup(), timeout(5_000)]).then(() => {
 *       cleanedUp = true
 *       app.quit()
 *     })
 *   })
 */
