import {
  app,
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron"

import { EVENTS, type MenuCommand } from "../shared/api"

const IS_MAC = process.platform === "darwin"

/** The sidebar's pages, in its order — ⌘1 is the first. */
const PAGES: [string, MenuCommand][] = [
  ["Tổng quan", "page:dashboard"],
  ["Thị trường", "page:market"],
  ["Biểu đồ", "page:chart"],
  ["Danh mục", "page:portfolio"],
  ["AI Analyst", "page:ai"],
]

/**
 * The application menu.
 *
 * Every item that does something the app owns sends the intent and the
 * renderer acts on it, so there is one implementation of each action rather
 * than a menu one and a button one.
 *
 * Replacing Electron's default menu means the editing and window roles it
 * provided have to be restated: without them ⌘C and ⌘V stop working in the
 * renderer, since those shortcuts are the menu's, not the page's.
 */
export function installMenu(getWindow: () => BrowserWindow | null): void {
  function send(command: MenuCommand): void {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(EVENTS.menuCommand, command)
  }

  const settingsItem: MenuItemConstructorOptions = {
    label: "Settings…",
    accelerator: "CmdOrCtrl+,",
    click: () => send("open-settings"),
  }

  const template: MenuItemConstructorOptions[] = [
    ...(IS_MAC
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settingsItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ] satisfies MenuItemConstructorOptions[],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Phân tích AI mới",
          accelerator: "CmdOrCtrl+N",
          click: () => send("new-analysis"),
        },
        ...(IS_MAC
          ? [{ type: "separator" as const }, { role: "close" as const }]
          : [
              { type: "separator" as const },
              settingsItem,
              { type: "separator" as const },
              { role: "quit" as const },
            ]),
      ],
    },
    { role: "editMenu" },
    {
      label: "Go",
      submenu: PAGES.map(([label, command], index) => ({
        label,
        accelerator: `CmdOrCtrl+${index + 1}`,
        click: () => send(command),
      })),
    },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
