/**
 * Technical indicators over candles — shared because both sides need the same
 * numbers: the chart draws them, and the analyst's `get_technicals` tool hands
 * them to the model. Two implementations would be two answers to "what is
 * the RSI", and the model would be arguing with the chart.
 *
 * Every series is aligned with its input: index `i` is the value at bar `i`,
 * `null` until the indicator has enough bars to mean anything. Pure, and
 * covered by `test/indicators.ts`.
 */
import type { Candle } from "./api"

export type Series = (number | null)[]

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!
    if (i >= period) sum -= values[i - period]!
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

/** Seeded with the SMA of the first `period` values, the usual convention —
 * seeding with the first value alone skews the first few dozen bars. */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** EMA over a series with leading nulls (MACD's signal line is one). */
function emaOf(series: Series, period: number): Series {
  const start = series.findIndex((value) => value !== null)
  const out: Series = new Array(series.length).fill(null)
  if (start < 0) return out
  const tail = ema(series.slice(start) as number[], period)
  tail.forEach((value, i) => (out[start + i] = value))
  return out
}

/** Wilder's RSI — his smoothing, not a plain average, which is what every
 * charting site shows and so what a reader will compare it against. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const delta = values[i]! - values[i - 1]!
    if (delta >= 0) gain += delta
    else loss -= delta
  }
  gain /= period
  loss /= period
  const at = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l))
  out[period] = at(gain, loss)
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i]! - values[i - 1]!
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period
    out[i] = at(gain, loss)
  }
  return out
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: Series; signal: Series; histogram: Series } {
  const fastLine = ema(values, fast)
  const slowLine = ema(values, slow)
  const line: Series = values.map((_, i) =>
    fastLine[i] != null && slowLine[i] != null
      ? fastLine[i]! - slowLine[i]!
      : null
  )
  const signal = emaOf(line, signalPeriod)
  const histogram: Series = line.map((value, i) =>
    value != null && signal[i] != null ? value - signal[i]! : null
  )
  return { macd: line, signal, histogram }
}

export function bollinger(
  values: number[],
  period = 20,
  width = 2
): { middle: Series; upper: Series; lower: Series } {
  const middle = sma(values, period)
  const upper: Series = new Array(values.length).fill(null)
  const lower: Series = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const mean = middle[i]!
    let variance = 0
    for (let j = i - period + 1; j <= i; j++)
      variance += (values[j]! - mean) ** 2
    const deviation = Math.sqrt(variance / period)
    upper[i] = mean + width * deviation
    lower[i] = mean - width * deviation
  }
  return { middle, upper, lower }
}

/** Average true range, Wilder-smoothed. */
export function atr(candles: Candle[], period = 14): Series {
  const out: Series = new Array(candles.length).fill(null)
  if (candles.length <= period) return out
  const tr = candles.map((bar, i) => {
    if (i === 0) return bar.high - bar.low
    const prevClose = candles[i - 1]!.close
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    )
  })
  let value = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  out[period] = value
  for (let i = period + 1; i < candles.length; i++) {
    value = (value * (period - 1) + tr[i]!) / period
    out[i] = value
  }
  return out
}

/**
 * Bars merged into buckets of `seconds`, aligned to the epoch — how a 4h chart
 * is drawn from hourly bars for the providers that have no 4h of their own.
 * Epoch alignment puts a Vietnamese session's morning and afternoon in their
 * own 4h bars (02:00 and 06:00 UTC), which is the split a reader expects.
 *
 * `offset` shifts the buckets' start: weeks have to begin on a Monday, and
 * the epoch fell on a Thursday (`WEEK_OFFSET`).
 */
export function aggregate(
  candles: Candle[],
  seconds: number,
  offset = 0
): Candle[] {
  const out: Candle[] = []
  for (const bar of candles) {
    const bucket = Math.floor((bar.time - offset) / seconds) * seconds + offset
    const last = out.at(-1)
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, bar.high)
      last.low = Math.min(last.low, bar.low)
      last.close = bar.close
      last.volume += bar.volume
    } else {
      out.push({ ...bar, time: bucket })
    }
  }
  return out
}

export const WEEK = 7 * 86_400

/** Monday 5 January 1970, 00:00 UTC — the first Monday after the epoch. */
export const WEEK_OFFSET = 4 * 86_400

export type PerformanceStats = {
  bars: number
  returnPct: number
  /** Standard deviation of bar-to-bar returns, in percent. */
  volatilityPct: number
  /** The worst fall from a running peak, as a negative percent. */
  maxDrawdownPct: number
}

/** Return, volatility and worst drawdown over the closes given. */
export function performanceStats(candles: Candle[]): PerformanceStats | null {
  if (candles.length < 2) return null
  const closes = candles.map((bar) => bar.close)
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1]! > 0) returns.push(closes[i]! / closes[i - 1]! - 1)
  }
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1)
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length || 1)
  let peak = closes[0]!
  let worst = 0
  for (const close of closes) {
    peak = Math.max(peak, close)
    if (peak > 0) worst = Math.min(worst, close / peak - 1)
  }
  return {
    bars: candles.length,
    returnPct: closes[0]! > 0 ? (closes.at(-1)! / closes[0]! - 1) * 100 : 0,
    volatilityPct: Math.sqrt(variance) * 100,
    maxDrawdownPct: worst * 100,
  }
}

export type Tone = "bullish" | "bearish" | "neutral"

export type Signal = { label: string; tone: Tone }

export type TechnicalSummary = {
  bars: number
  last: number
  /** Percent change over the last 1, 7 and 30 bars, null when too short. */
  change: { bars1: number | null; bars7: number | null; bars30: number | null }
  sma20: number | null
  sma50: number | null
  sma200: number | null
  rsi14: number | null
  macd: { macd: number; signal: number; histogram: number } | null
  bollinger: {
    upper: number
    middle: number
    lower: number
    /** Where the close sits in the band: 0 the lower, 1 the upper. */
    percentB: number
  } | null
  atr14: number | null
  /** ATR as a percent of the close — volatility comparable across prices. */
  atrPct: number | null
  /** Lowest low and highest high of the last 20 bars. */
  support: number
  resistance: number
  /** Highest high and lowest low over every bar given. */
  rangeHigh: number
  rangeLow: number
  /** The last bar's volume over the 20-bar average. */
  volumeRatio: number | null
  signals: Signal[]
  /** −1 (every signal bearish) to 1 (every signal bullish). */
  score: number
  verdict: string
}

const last = (series: Series): number | null => series.at(-1) ?? null

function pctChange(closes: number[], bars: number): number | null {
  if (closes.length <= bars) return null
  const from = closes[closes.length - 1 - bars]!
  return from === 0 ? null : ((closes.at(-1)! - from) / from) * 100
}

/** The verdict a score reads as, in the five steps traders are used to. */
export function verdictOf(score: number): string {
  if (score >= 0.5) return "Mua mạnh"
  if (score >= 0.15) return "Mua"
  if (score > -0.15) return "Trung lập"
  if (score > -0.5) return "Bán"
  return "Bán mạnh"
}

/**
 * Everything the chart's side panel and the analyst's tool report about a
 * series, with the rule-of-thumb readings spelled out as signals.
 *
 * The signals are the textbook ones and deliberately nothing cleverer — they
 * are a summary a reader can check against the chart, not a strategy.
 */
export function technicalSummary(candles: Candle[]): TechnicalSummary | null {
  if (candles.length < 2) return null
  const closes = candles.map((bar) => bar.close)
  const close = closes.at(-1)!
  const recent = candles.slice(-20)
  const sma20 = last(sma(closes, 20))
  const sma50 = last(sma(closes, 50))
  const sma200 = last(sma(closes, 200))
  const rsi14 = last(rsi(closes, 14))
  const m = macd(closes)
  const macdNow = last(m.macd)
  const signalNow = last(m.signal)
  const histNow = last(m.histogram)
  const histPrev = m.histogram.at(-2) ?? null
  const bands = bollinger(closes)
  const upper = last(bands.upper)
  const lower = last(bands.lower)
  const middle = last(bands.middle)
  const atr14 = last(atr(candles, 14))
  const volumes = candles.map((bar) => bar.volume)
  const avgVolume = last(sma(volumes, 20))

  const signals: Signal[] = []
  const above = (level: number | null, name: string) => {
    if (level == null) return
    signals.push(
      close >= level
        ? { label: `Giá trên ${name}`, tone: "bullish" }
        : { label: `Giá dưới ${name}`, tone: "bearish" }
    )
  }
  above(sma20, "SMA20")
  above(sma50, "SMA50")
  above(sma200, "SMA200")
  if (sma50 != null && sma200 != null) {
    signals.push(
      sma50 >= sma200
        ? {
            label: "SMA50 trên SMA200 (xu hướng tăng dài hạn)",
            tone: "bullish",
          }
        : {
            label: "SMA50 dưới SMA200 (xu hướng giảm dài hạn)",
            tone: "bearish",
          }
    )
  }
  if (rsi14 != null) {
    if (rsi14 >= 70)
      signals.push({ label: "RSI quá mua (≥ 70)", tone: "bearish" })
    else if (rsi14 <= 30)
      signals.push({ label: "RSI quá bán (≤ 30)", tone: "bullish" })
    else
      signals.push({
        label: `RSI trung tính (${rsi14.toFixed(0)})`,
        tone: rsi14 >= 50 ? "bullish" : "bearish",
      })
  }
  if (histNow != null && histPrev != null) {
    if (histPrev <= 0 && histNow > 0)
      signals.push({
        label: "MACD vừa cắt lên đường tín hiệu",
        tone: "bullish",
      })
    else if (histPrev >= 0 && histNow < 0)
      signals.push({
        label: "MACD vừa cắt xuống đường tín hiệu",
        tone: "bearish",
      })
    else
      signals.push(
        histNow > 0
          ? { label: "MACD trên đường tín hiệu", tone: "bullish" }
          : { label: "MACD dưới đường tín hiệu", tone: "bearish" }
      )
  }
  if (upper != null && lower != null) {
    if (close > upper)
      signals.push({ label: "Giá vượt dải Bollinger trên", tone: "bearish" })
    else if (close < lower)
      signals.push({ label: "Giá thủng dải Bollinger dưới", tone: "bullish" })
  }

  const directional = signals.filter((each) => each.tone !== "neutral")
  const score = directional.length
    ? directional.reduce(
        (sum, each) => sum + (each.tone === "bullish" ? 1 : -1),
        0
      ) / directional.length
    : 0

  return {
    bars: candles.length,
    last: close,
    change: {
      bars1: pctChange(closes, 1),
      bars7: pctChange(closes, 7),
      bars30: pctChange(closes, 30),
    },
    sma20,
    sma50,
    sma200,
    rsi14,
    macd:
      macdNow != null && signalNow != null && histNow != null
        ? { macd: macdNow, signal: signalNow, histogram: histNow }
        : null,
    bollinger:
      upper != null && lower != null && middle != null
        ? {
            upper,
            middle,
            lower,
            percentB: upper === lower ? 0.5 : (close - lower) / (upper - lower),
          }
        : null,
    atr14,
    atrPct: atr14 != null && close !== 0 ? (atr14 / close) * 100 : null,
    support: Math.min(...recent.map((bar) => bar.low)),
    resistance: Math.max(...recent.map((bar) => bar.high)),
    rangeHigh: Math.max(...candles.map((bar) => bar.high)),
    rangeLow: Math.min(...candles.map((bar) => bar.low)),
    volumeRatio:
      avgVolume != null && avgVolume > 0
        ? candles.at(-1)!.volume / avgVolume
        : null,
    signals,
    score,
    verdict: verdictOf(score),
  }
}
