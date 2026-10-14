import type { Candle, Interval, Quote } from "../../shared/api"
import { aggregate, WEEK, WEEK_OFFSET } from "../../shared/indicators"
import { currencyOf, toKey, VN_INDICES } from "../../shared/market"
import type { Fetch } from "./http"

/**
 * VNDirect's chart feed — TradingView's UDF format, no key, and it carries
 * HOSE, HNX and UPCoM stocks and the indices on one endpoint.
 */
const BASE = "https://dchart-api.vndirect.com.vn/dchart/history"

const DAY = 86_400

/**
 * How far back each interval asks: about 500 bars, like the other feeds.
 *
 * The feed has only minutes and days — it answers `W` (and `1W`) with the
 * plain-text "Not support resolution W", for every symbol — so a week is ten
 * years of daily bars folded into weeks, as 4h is folded from hours.
 */
const SPAN: Record<Interval, { resolution: string; seconds: number }> = {
  "1h": { resolution: "60", seconds: 120 * DAY },
  "4h": { resolution: "60", seconds: 400 * DAY },
  "1d": { resolution: "D", seconds: 2 * 365 * DAY },
  "1w": { resolution: "D", seconds: 10 * 365 * DAY },
}

type Udf = {
  s: string
  t?: number[]
  o?: number[]
  h?: number[]
  l?: number[]
  c?: number[]
  v?: number[]
}

/**
 * Stocks come back in thousands of đồng (`57.1` is 57,100₫) and are scaled
 * here, so every price past this file is in plain đồng. Indices are points and
 * are left alone.
 */
export function parseUdf(json: unknown, symbol: string): Candle[] {
  const udf = json as Udf
  if (!udf || udf.s !== "ok" || !udf.t) return []
  const scale = VN_INDICES.has(symbol) ? 1 : 1000
  return udf.t.map((time, i) => ({
    time,
    open: (udf.o?.[i] ?? 0) * scale,
    high: (udf.h?.[i] ?? 0) * scale,
    low: (udf.l?.[i] ?? 0) * scale,
    close: (udf.c?.[i] ?? 0) * scale,
    volume: udf.v?.[i] ?? 0,
  }))
}

export async function vndirectCandles(
  fetchJson: Fetch,
  symbol: string,
  interval: Interval,
  now = Math.floor(Date.now() / 1000)
): Promise<Candle[]> {
  const span = SPAN[interval]
  const url = `${BASE}?resolution=${span.resolution}&symbol=${encodeURIComponent(symbol)}&from=${now - span.seconds}&to=${now}`
  const candles = parseUdf(await fetchJson(url), symbol)
  if (interval === "4h") return aggregate(candles, 4 * 3600)
  if (interval === "1w") return aggregate(candles, WEEK, WEEK_OFFSET)
  return candles
}

/**
 * A quote made from the last two daily bars — the feed has no quote endpoint,
 * and during a session its last daily bar is the session so far.
 */
export function quoteFromCandles(
  market: Quote["market"],
  symbol: string,
  name: string,
  candles: Candle[]
): Quote | null {
  const lastBar = candles.at(-1)
  if (!lastBar) return null
  const prev = candles.at(-2)?.close ?? lastBar.open
  const change = lastBar.close - prev
  return {
    key: toKey(market, symbol),
    market,
    symbol,
    name,
    price: lastBar.close,
    change,
    changePct: prev ? (change / prev) * 100 : 0,
    high: lastBar.high,
    low: lastBar.low,
    volume: lastBar.volume,
    currency: currencyOf(market, symbol),
    time: lastBar.time,
  }
}

export async function vndirectQuote(
  fetchJson: Fetch,
  symbol: string,
  now = Math.floor(Date.now() / 1000)
): Promise<Quote | null> {
  // Two weeks covers the longest closure (Tết shuts the market for a week).
  const url = `${BASE}?resolution=D&symbol=${encodeURIComponent(symbol)}&from=${now - 14 * DAY}&to=${now}`
  return quoteFromCandles(
    "vn",
    symbol,
    symbol,
    parseUdf(await fetchJson(url), symbol)
  )
}
