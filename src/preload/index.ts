import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron"

import {
  EVENTS,
  IPC,
  type AiThread,
  type DesktopApi,
  type MenuCommand,
  type Transaction,
  type WatchItem,
} from "../shared/api"

/**
 * Subscribes to a main-process event, handing the listener only the payload.
 * The `IpcRendererEvent` is deliberately not passed through: it carries a
 * `sender` the renderer has no business holding.
 */
function subscribe<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const api: DesktopApi = {
  // `process.platform` is one of the few things a sandboxed preload still has.
  platform: process.platform as DesktopApi["platform"],

  appInfo: () => ipcRenderer.invoke(IPC.appInfo),

  getSetting: (key) => ipcRenderer.invoke(IPC.getSetting, key),
  setSetting: (key, value) => ipcRenderer.invoke(IPC.setSetting, key, value),

  getQuotes: (keys) => ipcRenderer.invoke(IPC.getQuotes, keys),
  getCandles: (key, interval) =>
    ipcRenderer.invoke(IPC.getCandles, key, interval),
  getCoinMarkets: () => ipcRenderer.invoke(IPC.getCoinMarkets),
  getFearGreed: () => ipcRenderer.invoke(IPC.getFearGreed),
  resolveInstrument: (market, input) =>
    ipcRenderer.invoke(IPC.resolveInstrument, market, input),

  listWatchlist: () => ipcRenderer.invoke(IPC.listWatchlist),
  addWatch: (instrument) => ipcRenderer.invoke(IPC.addWatch, instrument),
  removeWatch: (key) => ipcRenderer.invoke(IPC.removeWatch, key),

  listTransactions: () => ipcRenderer.invoke(IPC.listTransactions),
  addTransaction: (transaction) =>
    ipcRenderer.invoke(IPC.addTransaction, transaction),
  updateTransaction: (id, transaction) =>
    ipcRenderer.invoke(IPC.updateTransaction, id, transaction),
  removeTransaction: (id) => ipcRenderer.invoke(IPC.removeTransaction, id),

  listAiModels: () => ipcRenderer.invoke(IPC.listAiModels),
  listThreads: () => ipcRenderer.invoke(IPC.listThreads),
  askAi: (threadId, prompt) => ipcRenderer.invoke(IPC.askAi, threadId, prompt),
  cancelAi: (threadId) => ipcRenderer.invoke(IPC.cancelAi, threadId),
  renameThread: (threadId, title) =>
    ipcRenderer.invoke(IPC.renameThread, threadId, title),
  removeThread: (threadId) => ipcRenderer.invoke(IPC.removeThread, threadId),

  onMenuCommand: (listener) =>
    subscribe<MenuCommand>(EVENTS.menuCommand, listener),
  onWatchlistChanged: (listener) =>
    subscribe<WatchItem[]>(EVENTS.watchlistChanged, listener),
  onTransactionsChanged: (listener) =>
    subscribe<Transaction[]>(EVENTS.transactionsChanged, listener),
  onThreadChanged: (listener) =>
    subscribe<AiThread>(EVENTS.threadChanged, listener),
  onThreadRemoved: (listener) =>
    subscribe<string>(EVENTS.threadRemoved, listener),
}

contextBridge.exposeInMainWorld("desktop", api)
