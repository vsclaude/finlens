import type { Candle, Interval, Quote } from "../../shared/api"
import { aggregate } from "../../shared/indicators"
import { toKey } from "../../shared/market"
import { num, type Fetch } from "./http"

/**
 * Yahoo's chart endpoint — unofficial, but keyless and the widest coverage
 * there is: US stocks, indices (`^GSPC`), FX (`USDVND=X`). One endpoint
 * answers both candles and the quote, which lives in its `meta`.
 */
const BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

/** Yahoo's interval and the longest range it serves at it. */
const SPAN: Record<Interval, { interval: string; range: string }> = {
  "1h": { interval: "60m", range: "3mo" },
  "4h": { interval: "60m", range: "1y" },
  "1d": { interval: "1d", range: "2y" },
  "1w": { interval: "1wk", range: "10y" },
}

type ChartResult = {
  meta: {
    symbol: string
    currency?: string
    longName?: string
    shortName?: string
    regularMarketPrice?: number
    chartPreviousClose?: number
    previousClose?: number
    regularMarketDayHigh?: number
    regularMarketDayLow?: number
    regularMarketVolume?: number
    regularMarketTime?: number
  }
  timestamp?: number[]
  indicators?: {
    quote?: {
      open?: (number | null)[]
      high?: (number | null)[]
      low?: (number | null)[]
      close?: (number | null)[]
      volume?: (number | null)[]
    }[]
  }
}

function result(json: unknown): ChartResult {
  const chart = (
    json as {
      chart?: { result?: ChartResult[]; error?: { description?: string } }
    }
  )?.chart
  const first = chart?.result?.[0]
  if (!first) throw new Error(chart?.error?.description ?? "Yahoo: no data")
  return first
}

/** Bars with a null close — a halted session, a holiday — are dropped rather
 * than drawn at zero. */
export function parseChart(json: unknown): Candle[] {
  const chart = result(json)
  const quote = chart.indicators?.quote?.[0]
  const out: Candle[] = []
  for (const [i, time] of (chart.timestamp ?? []).entries()) {
    const close = quote?.close?.[i]
    if (close == null) continue
    out.push({
      time,
      open: quote?.open?.[i] ?? close,
      high: quote?.high?.[i] ?? close,
      low: quote?.low?.[i] ?? close,
      close,
      volume: quote?.volume?.[i] ?? 0,
    })
  }
  return out
}

export function parseChartQuote(json: unknown): Quote {
  const { meta } = result(json)
  const price = num(meta.regularMarketPrice)
  const prev = num(meta.chartPreviousClose ?? meta.previousClose) || price
  return {
    key: toKey("us", meta.symbol),
    market: "us",
    symbol: meta.symbol,
    name: meta.shortName ?? meta.longName ?? meta.symbol,
    price,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    high: num(meta.regularMarketDayHigh) || price,
    low: num(meta.regularMarketDayLow) || price,
    volume: num(meta.regularMarketVolume),
    currency: meta.currency ?? "USD",
    time: num(meta.regularMarketTime),
  }
}

export async function yahooCandles(
  fetchJson: Fetch,
  symbol: string,
  interval: Interval
): Promise<Candle[]> {
  const span = SPAN[interval]
  const candles = parseChart(
    await fetchJson(
      `${BASE}/${encodeURIComponent(symbol)}?range=${span.range}&interval=${span.interval}`
    )
  )
  return interval === "4h" ? aggregate(candles, 4 * 3600) : candles
}

export async function yahooQuote(
  fetchJson: Fetch,
  symbol: string
): Promise<Quote> {
  // `range=1d` is what makes `chartPreviousClose` yesterday's close; over a
  // longer range it is the close before the range began.
  return parseChartQuote(
    await fetchJson(
      `${BASE}/${encodeURIComponent(symbol)}?range=1d&interval=1d`
    )
  )
}
