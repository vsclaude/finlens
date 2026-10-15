/**
 * The IPC contract, from main's side: every channel in `IPC` has a handler in
 * `createIpc`, nothing is handled that is not in `IPC`, and the handlers work
 * against a fake `Host` — no Electron in the process at all, and no network:
 * market data comes from a fake fetch.
 *
 * The preload's half cannot be imported here (it needs `electron`), but its
 * object is typed `DesktopApi`, so `tsc` refuses a missing thunk.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  EVENTS,
  IPC,
  type Transaction,
  type WatchItem,
} from "../src/shared/api"
import { DATA_DIR_ENV } from "../src/shared/app"
import type { Host } from "../src/main/host"
import { MarketData } from "../src/main/market/market-data"
import { check, finish, section } from "./harness"

const dir = mkdtempSync(path.join(tmpdir(), "finlens-ipc-"))
// Before `createIpc` reads it — see `main/data-dir.ts`.
process.env[DATA_DIR_ENV] = dir
const { createIpc } = await import("../src/main/ipc")

const sent: { channel: string; payload: unknown }[] = []
const host: Host = {
  send: (channel, payload) => sent.push({ channel, payload }),
  claudeExecutable: undefined,
  version: "9.9.9",
}

/** Answers Binance's 24h ticker for any USDT pair; everything else is a 404. */
const market = new MarketData(async (url) => {
  if (url.includes("ticker/24hr")) {
    const symbols = JSON.parse(
      decodeURIComponent(new URL(url).searchParams.get("symbols") ?? "[]")
    ) as string[]
    return symbols.map((symbol) => ({
      symbol,
      lastPrice: "100",
      priceChange: "1",
      priceChangePercent: "1",
      highPrice: "101",
      lowPrice: "99",
      quoteVolume: "1000",
      closeTime: 1_700_000_000_000,
    }))
  }
  throw new Error("404")
})

try {
  const { handlers } = createIpc(host, market)
  const call = (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return handler(undefined, ...args)
  }

  section("Every channel is handled")
  const channels = Object.values(IPC) as string[]
  for (const channel of channels) {
    check(channel, handlers.has(channel))
  }
  const extra = [...handlers.keys()].filter((c) => !channels.includes(c))
  check("nothing handled outside IPC", extra.length === 0, extra)
  const events = Object.values(EVENTS) as string[]
  const overlap = channels.filter((c) => events.includes(c))
  check("IPC and EVENTS are disjoint", overlap.length === 0, overlap)

  section("Handlers")
  const info = (await call(IPC.appInfo)) as { version: string }
  check("appInfo reads the host's version", info.version === "9.9.9", info)

  check(
    "a setting reads its default",
    (await call(IPC.getSetting, "aiModel")) === "opus"
  )
  await call(IPC.setSetting, "baseCurrency", "VND")
  check(
    "a setting reads back",
    (await call(IPC.getSetting, "baseCurrency")) === "VND"
  )

  section("Market")
  const resolved = (await call(IPC.resolveInstrument, "crypto", "sol")) as {
    key: string
  } | null
  check(
    "resolves a typed coin to its pair",
    resolved?.key === "crypto:SOLUSDT",
    resolved
  )
  const unknown = await call(IPC.resolveInstrument, "us", "NOPE")
  check("an unknown symbol resolves to null", unknown === null, unknown)

  section("Watchlist")
  const seeded = (await call(IPC.listWatchlist)) as WatchItem[]
  check("a first run is seeded", seeded.length > 0, seeded.length)
  await call(IPC.addWatch, resolved)
  const push = sent.at(-1)
  check(
    "an add is pushed",
    push?.channel === EVENTS.watchlistChanged,
    push?.channel
  )
  check(
    "with the whole list",
    (push?.payload as WatchItem[]).some((each) => each.key === "crypto:SOLUSDT")
  )
  await call(IPC.addWatch, resolved)
  check(
    "adding twice does not duplicate",
    (sent.at(-1)?.payload as WatchItem[]).filter(
      (each) => each.key === "crypto:SOLUSDT"
    ).length === 1
  )
  await call(IPC.removeWatch, "crypto:SOLUSDT")
  check(
    "a remove is pushed too",
    !(sent.at(-1)?.payload as WatchItem[]).some(
      (each) => each.key === "crypto:SOLUSDT"
    )
  )

  section("Portfolio")
  const trade = (await call(IPC.addTransaction, {
    market: "vn",
    symbol: " fpt ",
    side: "buy",
    quantity: 100,
    price: 57_000,
    fee: 0,
    date: "2026-01-02",
    note: "",
  })) as Transaction
  check("a trade is keyed and cleaned", trade.key === "vn:FPT", trade)
  check("and pushed", sent.at(-1)?.channel === EVENTS.transactionsChanged)
  let refused = false
  try {
    await call(IPC.addTransaction, {
      market: "vn",
      symbol: "FPT",
      side: "sell",
      quantity: 500,
      price: 60_000,
      fee: 0,
      date: "2026-02-01",
      note: "",
    })
  } catch {
    refused = true
  }
  check("an oversell is refused", refused)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

finish()
