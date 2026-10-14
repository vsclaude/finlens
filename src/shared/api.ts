/**
 * The contract between the main process and the renderer: every call that
 * crosses between them, and every event pushed back.
 *
 * Types only, plus the two channel tables at the bottom. Adding or changing a
 * call means touching four places — the method here, its channel in `IPC`, its
 * thunk in `src/preload/index.ts` and its handler in `src/main/ipc.ts` — which
 * is deliberate: the alternative is two sides that disagree about what a call
 * returns. `test/ipc-contract.ts` checks that every channel has a handler.
 */

import type { AgentModel, AiEffort } from "./ai-models"

export type { AgentModel, AiEffort } from "./ai-models"

export type Platform = "darwin" | "win32" | "linux"

/** The accent palettes `styles/globals.css` defines, `indigo` being none. */
export type Palette = "indigo" | "graphite" | "teal" | "rose" | "amber"

/** What the analyst answers in. */
export type AiLanguage = "vi" | "en"

/** The currency the portfolio's totals are summed in. */
export type BaseCurrency = "USD" | "VND"

/**
 * Everything kept in `settings.json`, with its default in `DEFAULT_SETTINGS`.
 * A key added here is read back as its default by an existing install, so a
 * new setting never needs a migration.
 *
 * The API key is not here: it is kept encrypted in its own file, and this
 * document is one the renderer reads whole.
 */
export type Settings = {
  palette: Palette
  /** A `value` from the CLI's own model list (`shared/ai-models.ts`) — an
   * alias such as `opus` rather than a dated id where the CLI offers one. */
  aiModel: string
  /** Null for a model that takes no effort level. */
  aiEffort: AiEffort | null
  aiLanguage: AiLanguage
  baseCurrency: BaseCurrency
}

export const DEFAULT_SETTINGS: Settings = {
  palette: "indigo",
  aiModel: "opus",
  aiEffort: null,
  aiLanguage: "vi",
  baseCurrency: "USD",
}

export type AppInfo = {
  name: string
  version: string
  /** Where this app keeps its files — shown so somebody can find them. */
  dataDir: string
}

// ---------------------------------------------------------------------------
// Market data

/**
 * Where an instrument trades, which is also which provider answers for it:
 * Binance for `crypto`, VNDirect for `vn` (HOSE/HNX/UPCoM and their indices),
 * Yahoo for `us` (and anything else Yahoo knows — indices, FX).
 */
export type Market = "crypto" | "vn" | "us"

/** `${market}:${symbol}` — see `shared/market.ts` for both directions. */
export type InstrumentKey = string

export type Interval = "1h" | "4h" | "1d" | "1w"

export type Candle = {
  /** Unix seconds, the bar's open. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Quote = {
  key: InstrumentKey
  market: Market
  symbol: string
  name: string
  price: number
  /** Against the previous close (stocks) or 24 hours ago (crypto). */
  change: number
  changePct: number
  high: number
  low: number
  volume: number
  currency: string
  /** Unix seconds of the last trade the provider reported. */
  time: number
}

/** One row of CoinGecko's market table. */
export type CoinMarket = {
  id: string
  symbol: string
  name: string
  image: string
  rank: number
  price: number
  marketCap: number
  volume: number
  change24h: number
  change7d: number
  /** Hourly prices over the last seven days. */
  sparkline: number[]
  /**
   * The Binance USDT pair the chart opens, or null when Binance does not list
   * the coin — CoinGecko ranks coins (stablecoins, exchange tokens) that no
   * chart in the app can draw.
   */
  pair: string | null
}

/** alternative.me's crypto Fear & Greed index, 0–100. */
export type FearGreed = {
  value: number
  label: string
  history: { time: number; value: number }[]
}

export type Instrument = {
  key: InstrumentKey
  market: Market
  symbol: string
  name: string
}

export type WatchItem = Instrument & {
  /** ISO. */
  addedAt: string
}

// ---------------------------------------------------------------------------
// Portfolio

export type Side = "buy" | "sell"

export type Transaction = {
  id: string
  key: InstrumentKey
  market: Market
  symbol: string
  side: Side
  quantity: number
  /** Per unit, in the instrument's own currency (VND for `vn`, USD else). */
  price: number
  /** In the same currency as `price`. */
  fee: number
  /** ISO date the trade happened, which is what orders the ledger. */
  date: string
  note: string
}

export type NewTransaction = Omit<Transaction, "id" | "key">

// ---------------------------------------------------------------------------
// The AI analyst

/** One tool call the analyst made, as shown in the transcript. */
export type AiToolUse = {
  name: string
  /** The input, summarised to one line. */
  detail: string
}

export type AiMessage = {
  id: string
  role: "user" | "assistant"
  /** Markdown. */
  text: string
  tools: AiToolUse[]
  /** ISO. */
  createdAt: string
  error?: string
}

export type AiThread = {
  id: string
  title: string
  /** The Agent SDK session a follow-up resumes; null until the first answer. */
  sessionId: string | null
  status: "idle" | "running"
  messages: AiMessage[]
  /** What the SDK estimated the whole thread has cost, in USD. */
  costUsd: number
  /** ISO. */
  createdAt: string
  updatedAt: string
}

export type AiAuth = {
  /** A key saved in this app's settings. */
  savedKey: boolean
  /** `ANTHROPIC_API_KEY` in the environment the app was started from. */
  envKey: boolean
}

/** What the application menu asks the renderer to do — see `main/menu.ts`. */
export type MenuCommand =
  | "open-settings"
  | "new-analysis"
  | "page:dashboard"
  | "page:market"
  | "page:chart"
  | "page:portfolio"
  | "page:ai"

export type DesktopApi = {
  /** `process.platform`, read once by the preload. */
  platform: Platform

  appInfo: () => Promise<AppInfo>

  getSetting: <K extends keyof Settings>(key: K) => Promise<Settings[K]>
  setSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) => Promise<void>

  /** A native folder picker; null when cancelled. */
  pickDirectory: () => Promise<string | null>
  /** Shows a path in the OS file manager. */
  revealPath: (target: string) => Promise<void>

  /** Instruments that failed to load are left out rather than failing all. */
  getQuotes: (keys: InstrumentKey[]) => Promise<Quote[]>
  getCandles: (key: InstrumentKey, interval: Interval) => Promise<Candle[]>
  getCoinMarkets: () => Promise<CoinMarket[]>
  getFearGreed: () => Promise<FearGreed>
  /** Normalises what somebody typed and checks the provider knows it. */
  resolveInstrument: (
    market: Market,
    input: string
  ) => Promise<Instrument | null>

  listWatchlist: () => Promise<WatchItem[]>
  addWatch: (instrument: Instrument) => Promise<void>
  removeWatch: (key: InstrumentKey) => Promise<void>

  listTransactions: () => Promise<Transaction[]>
  /** Refuses a sell of more than is held on that date. */
  addTransaction: (transaction: NewTransaction) => Promise<Transaction>
  removeTransaction: (id: string) => Promise<void>

  getAiAuth: () => Promise<AiAuth>
  /** Null forgets the saved key. */
  setAiApiKey: (key: string | null) => Promise<void>
  /**
   * The models the analyst's Claude Code offers this account, asked of the
   * CLI itself (no tokens spent). Empty when it could not be asked — the
   * picker's cue to draw `AI_MODEL_FALLBACK`.
   */
  listAiModels: () => Promise<AgentModel[]>
  listThreads: () => Promise<AiThread[]>
  /** Starts a thread when `threadId` is null. Answers at once with the
   * thread's id; the reply arrives through `onThreadChanged`. */
  askAi: (threadId: string | null, prompt: string) => Promise<string>
  cancelAi: (threadId: string) => Promise<void>
  removeThread: (threadId: string) => Promise<void>

  /** Each returns its own unsubscribe. */
  onMenuCommand: (listener: (command: MenuCommand) => void) => () => void
  onWatchlistChanged: (listener: (items: WatchItem[]) => void) => () => void
  onTransactionsChanged: (
    listener: (transactions: Transaction[]) => void
  ) => () => void
  onThreadChanged: (listener: (thread: AiThread) => void) => () => void
  onThreadRemoved: (listener: (threadId: string) => void) => () => void
}

/** Request/response channels: `ipcRenderer.invoke` ↔ `ipcMain.handle`. */
export const IPC = {
  appInfo: "app:info",
  getSetting: "settings:get",
  setSetting: "settings:set",
  pickDirectory: "dialog:pick-directory",
  revealPath: "shell:reveal",
  getQuotes: "market:quotes",
  getCandles: "market:candles",
  getCoinMarkets: "market:coins",
  getFearGreed: "market:fear-greed",
  resolveInstrument: "market:resolve",
  listWatchlist: "watchlist:list",
  addWatch: "watchlist:add",
  removeWatch: "watchlist:remove",
  listTransactions: "portfolio:list",
  addTransaction: "portfolio:add",
  removeTransaction: "portfolio:remove",
  getAiAuth: "ai:auth",
  setAiApiKey: "ai:set-key",
  listAiModels: "ai:models",
  listThreads: "ai:threads",
  askAi: "ai:ask",
  cancelAi: "ai:cancel",
  removeThread: "ai:remove",
} as const

/**
 * Push channels: main → every window (`webContents.send` ↔ `ipcRenderer.on`).
 * Kept apart from `IPC` because nothing handles them in main, which is what
 * lets the contract test say "every `IPC` channel has a handler".
 */
export const EVENTS = {
  menuCommand: "menu:command",
  watchlistChanged: "watchlist:changed",
  transactionsChanged: "portfolio:changed",
  threadChanged: "ai:thread-changed",
  threadRemoved: "ai:thread-removed",
} as const
