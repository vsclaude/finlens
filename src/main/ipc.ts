import {
  EVENTS,
  IPC,
  type Instrument,
  type InstrumentKey,
  type Interval,
  type Market,
  type NewTransaction,
  type Settings,
} from "../shared/api"
import { APP_NAME } from "../shared/app"
import { Analyst } from "./ai/analyst"
import { createClaudeRunner } from "./ai/claude"
import { createModelLister } from "./ai/models"
import { dataDir } from "./data-dir"
import type { Host } from "./host"
import { MarketData } from "./market/market-data"
import { Portfolio } from "./portfolio"
import { SettingsStore } from "./settings"
import { Watchlist } from "./watchlist"

/**
 * One handler. `caller` is whatever the transport identifies a window by —
 * Electron's `IpcMainInvokeEvent` in the app, anything at all in a test — and
 * is only ever handed back to `host`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (caller: unknown, ...args: any[]) => unknown

/**
 * Every handler in the app, as a table keyed by channel, and the long-lived
 * state they share.
 *
 * Deliberately does **not** import `electron`: `electron-ipc.ts` puts these on
 * `ipcMain`, and a test calls them straight out of `handlers` with a fake
 * `Host` — which is how `test/ipc-contract.ts` checks every channel in `IPC`
 * has one.
 *
 * `market` is injectable so the contract test can run without the network;
 * the app takes the real one.
 */
export function createIpc(
  host: Host,
  market: MarketData = new MarketData()
): {
  handlers: Map<string, Handler>
  settings: SettingsStore
  watchlist: Watchlist
  portfolio: Portfolio
  analyst: Analyst
} {
  const handlers = new Map<string, Handler>()
  function handle(channel: string, handler: Handler) {
    if (handlers.has(channel)) throw new Error(`Two handlers for ${channel}`)
    handlers.set(channel, handler)
  }

  const dir = dataDir()
  const settings = new SettingsStore(dir)
  const watchlist = new Watchlist(dir)
  const portfolio = new Portfolio(dir)
  const models = createModelLister({
    dataDir: dir,
    executable: host.claudeExecutable,
    version: host.version,
  })
  const analyst = new Analyst(
    dir,
    createClaudeRunner({
      dataDir: dir,
      context: { market, watchlist, portfolio, settings },
      settings,
      executable: host.claudeExecutable,
      version: host.version,
    }),
    {
      changed: (thread) => host.send(EVENTS.threadChanged, thread),
      removed: (threadId) => host.send(EVENTS.threadRemoved, threadId),
    }
  )

  handle(IPC.appInfo, () => ({
    name: APP_NAME,
    version: host.version,
  }))

  handle(IPC.getSetting, (_caller, key: keyof Settings) => settings.get(key))
  handle(
    IPC.setSetting,
    <K extends keyof Settings>(_caller: unknown, key: K, value: Settings[K]) =>
      settings.set(key, value)
  )

  handle(IPC.getQuotes, (_caller, keys: InstrumentKey[]) => market.quotes(keys))
  handle(IPC.getCandles, (_caller, key: InstrumentKey, interval: Interval) =>
    market.candles(key, interval)
  )
  handle(IPC.getCoinMarkets, () => market.coinMarkets())
  handle(IPC.getFearGreed, () => market.fearGreed())
  handle(IPC.resolveInstrument, (_caller, which: Market, input: string) =>
    market.resolve(which, input)
  )

  // Every window sees every write, so a second window never shows a stale
  // list — the renderer's stores listen rather than re-reading after a call.
  handle(IPC.listWatchlist, () => watchlist.list())
  handle(IPC.addWatch, async (_caller, instrument: Instrument) => {
    host.send(EVENTS.watchlistChanged, await watchlist.add(instrument))
  })
  handle(IPC.removeWatch, async (_caller, key: InstrumentKey) => {
    host.send(EVENTS.watchlistChanged, await watchlist.remove(key))
  })

  handle(IPC.listTransactions, () => portfolio.list())
  handle(IPC.addTransaction, async (_caller, input: NewTransaction) => {
    const { transaction, all } = await portfolio.add(input)
    host.send(EVENTS.transactionsChanged, all)
    return transaction
  })
  handle(
    IPC.updateTransaction,
    async (_caller, id: string, input: NewTransaction) => {
      const { transaction, all } = await portfolio.update(id, input)
      host.send(EVENTS.transactionsChanged, all)
      return transaction
    }
  )
  handle(IPC.removeTransaction, async (_caller, id: string) => {
    host.send(EVENTS.transactionsChanged, await portfolio.remove(id))
  })

  handle(IPC.listAiModels, () => models.list())
  handle(IPC.listThreads, () => analyst.list())
  handle(IPC.askAi, (_caller, threadId: string | null, prompt: string) =>
    analyst.ask(threadId, prompt)
  )
  handle(IPC.cancelAi, (_caller, threadId: string) => analyst.cancel(threadId))
  handle(IPC.renameThread, (_caller, threadId: string, title: string) =>
    analyst.rename(threadId, title)
  )
  handle(IPC.removeThread, (_caller, threadId: string) =>
    analyst.remove(threadId)
  )

  return { handlers, settings, watchlist, portfolio, analyst }
}
