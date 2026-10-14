import type { Candle, Interval, Quote } from "../../shared/api"
import { baseAsset, currencyOf, toKey } from "../../shared/market"
import { num, type Fetch } from "./http"

/**
 * Binance's public market-data mirror rather than `api.binance.com`: the same
 * endpoints with no key, and not geo-blocked the way the trading API is (a US
 * address gets a 451 there).
 */
const BASE = "https://data-api.binance.vision/api/v3"

/** Binance has every interval the app offers natively. */
const LIMIT = 500

export function parseKlines(json: unknown): Candle[] {
  if (!Array.isArray(json)) throw new Error("Binance: unexpected klines")
  return json.map((row: unknown[]) => ({
    time: Math.floor(num(row[0]) / 1000),
    open: num(row[1]),
    high: num(row[2]),
    low: num(row[3]),
    close: num(row[4]),
    volume: num(row[5]),
  }))
}

type Ticker = {
  symbol: string
  lastPrice: string
  priceChange: string
  priceChangePercent: string
  highPrice: string
  lowPrice: string
  quoteVolume: string
  closeTime: number
}

export function parseTicker(ticker: Ticker): Quote {
  return {
    key: toKey("crypto", ticker.symbol),
    market: "crypto",
    symbol: ticker.symbol,
    name: baseAsset(ticker.symbol),
    price: num(ticker.lastPrice),
    change: num(ticker.priceChange),
    changePct: num(ticker.priceChangePercent),
    high: num(ticker.highPrice),
    low: num(ticker.lowPrice),
    // Quote volume — in dollars for a USDT pair — reads across coins where
    // a base volume of "12M" PEPE and "12" BTC do not.
    volume: num(ticker.quoteVolume),
    currency: currencyOf("crypto", ticker.symbol),
    time: Math.floor(num(ticker.closeTime) / 1000),
  }
}

/**
 * Binance answers an unknown pair with a 400 and `Invalid symbol.` — the one
 * failure a user can cause by clicking, so it is the one put in their words.
 */
function unlisted(error: unknown, symbol: string): unknown {
  return /invalid symbol/i.test(String(error))
    ? new Error(`Binance không niêm yết cặp ${symbol}.`)
    : error
}

export async function binanceCandles(
  fetchJson: Fetch,
  symbol: string,
  interval: Interval
): Promise<Candle[]> {
  try {
    return parseKlines(
      await fetchJson(
        `${BASE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${LIMIT}`
      )
    )
  } catch (error) {
    throw unlisted(error, symbol)
  }
}

/** Every pair Binance trades, from its price list — 150KB, the smallest
 * endpoint that names them all (`exchangeInfo` is ten times that). */
export function parsePairs(json: unknown): Set<string> {
  if (!Array.isArray(json)) throw new Error("Binance: unexpected price list")
  return new Set((json as { symbol: string }[]).map((each) => each.symbol))
}

export async function binancePairs(fetchJson: Fetch): Promise<Set<string>> {
  return parsePairs(await fetchJson(`${BASE}/ticker/price`))
}

/** One request for every pair, which is the point of the `symbols` form. */
export async function binanceQuotes(
  fetchJson: Fetch,
  symbols: string[]
): Promise<Quote[]> {
  if (symbols.length === 0) return []
  // One unknown pair fails the whole batch, so a batch that fails is retried
  // a pair at a time to keep the rest of the watchlist.
  try {
    const json = await fetchJson(
      `${BASE}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    )
    return (json as Ticker[]).map(parseTicker)
  } catch (error) {
    if (symbols.length === 1) throw unlisted(error, symbols[0]!)
    const each = await Promise.allSettled(
      symbols.map((symbol) => binanceQuotes(fetchJson, [symbol]))
    )
    return each.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    )
  }
}
