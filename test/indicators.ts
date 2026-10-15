/**
 * The indicators both the chart and the analyst read — checked against values
 * worked by hand, and against the shapes that have to hold (alignment, warm-up
 * nulls, the summary's verdict on an obvious trend).
 */
import type { Candle } from "../src/shared/api"
import {
  aggregate,
  atr,
  bollinger,
  correlation,
  ema,
  macd,
  performanceStats,
  returnCorrelations,
  rsi,
  sma,
  technicalSummary,
  verdictOf,
} from "../src/shared/indicators"
import { check, finish, section } from "./harness"

const close = (a: number | null | undefined, b: number, eps = 1e-9) =>
  a != null && Math.abs(a - b) < eps

const bars = (
  closes: number[],
  start = 1_700_000_000,
  step = 86_400
): Candle[] =>
  closes.map((c, i) => ({
    time: start + i * step,
    open: i ? closes[i - 1]! : c,
    high: Math.max(c, i ? closes[i - 1]! : c) + 1,
    low: Math.min(c, i ? closes[i - 1]! : c) - 1,
    close: c,
    volume: 100 + i,
  }))

section("sma / ema")
const s = sma([1, 2, 3, 4, 5], 3)
check("aligned with its input", s.length === 5)
check("null while warming up", s[0] === null && s[1] === null)
check("averages the window", close(s[2], 2) && close(s[4], 4), s)
const e = ema([1, 2, 3, 4, 5], 3)
check("ema seeds with the sma", close(e[2], 2), e)
check("then weights the newest by 2/(n+1)", close(e[3], 3) && close(e[4], 4), e)
check(
  "too short is all null",
  ema([1, 2], 3).every((v) => v === null)
)

section("rsi")
const rising = Array.from({ length: 30 }, (_, i) => 100 + i)
check("only gains is 100", close(rsi(rising).at(-1), 100))
const falling = Array.from({ length: 30 }, (_, i) => 100 - i)
check("only losses is 0", close(rsi(falling).at(-1), 0))
const zigzag = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 1 : -1))
const mid = rsi(zigzag).at(-1)!
check("an even zigzag sits near 50", mid > 40 && mid < 60, mid)
check(
  "null until it has its period",
  rsi(rising)[13] === null && rsi(rising)[14] !== null
)

section("macd / bollinger / atr")
// 26 bars for the slow line and 9 more for the signal: 30 is too few.
const m = macd(Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i)))
check("macd is positive in an uptrend", (m.macd.at(-1) ?? 0) > 0, m.macd.at(-1))
check(
  "histogram is macd minus signal",
  close(m.histogram.at(-1), m.macd.at(-1)! - m.signal.at(-1)!)
)
const flat = bollinger(new Array(25).fill(10))
check(
  "flat prices have no band",
  close(flat.upper.at(-1), 10) && close(flat.lower.at(-1), 10)
)
const band = bollinger(Array.from({ length: 25 }, (_, i) => (i % 2 ? 12 : 8)))
check(
  "upper above middle above lower",
  band.upper.at(-1)! > band.middle.at(-1)! &&
    band.middle.at(-1)! > band.lower.at(-1)!
)
const a = atr(bars(rising))
check(
  "atr is positive once warm",
  (a.at(-1) ?? 0) > 0 && a[13] === null,
  a.at(-1)
)

section("aggregate")
const hourly = bars([1, 2, 3, 4, 5, 6, 7, 8], 4 * 3600 * 1000, 3600)
const four = aggregate(hourly, 4 * 3600)
check("eight hours make two 4h bars", four.length === 2, four)
check("opens with the first", four[0]!.open === hourly[0]!.open)
check("closes with the last", four[0]!.close === 4 && four[1]!.close === 8)
check(
  "sums the volume",
  four[0]!.volume === hourly.slice(0, 4).reduce((sum, b) => sum + b.volume, 0)
)
check(
  "high is the bucket's highest",
  four[1]!.high === Math.max(...hourly.slice(4).map((b) => b.high))
)
check("does not touch its input", hourly[1]!.time === 4 * 3600 * 1000 + 3600)

section("performanceStats")
const p = performanceStats(bars([100, 120, 90, 110]))!
check("return is first to last", close(p.returnPct, 10), p)
check("drawdown is from the running peak", close(p.maxDrawdownPct, -25), p)
check("volatility is positive", p.volatilityPct > 0)
check("one bar is no answer", performanceStats(bars([1])) === null)

section("correlation")
check(
  "a series with itself is 1",
  close(correlation([1, 3, 2, 5], [1, 3, 2, 5]), 1)
)
check(
  "with its mirror is −1",
  close(correlation([1, 3, 2, 5], [-1, -3, -2, -5]), -1)
)
check("a flat series has none", correlation([1, 2, 3], [4, 4, 4]) === null)
check("two points are no answer", correlation([1, 2], [2, 1]) === null)

const DAY = 86_400
const zig = [100, 110, 99, 120, 108, 130]
// Same sessions stamped six hours apart, plus a bar only one side has: the
// buckets have to pair them and drop the extra.
const early = bars(zig, 1_700_006_400)
const late = bars([...zig.map((c) => c * 2), 999], 1_700_006_400 + 6 * 3600)
const pair = returnCorrelations(
  [
    { candles: early, offset: 0 },
    { candles: late, offset: 0 },
  ],
  DAY
)
check("pairs bars by bucket, not stamp", pair.bars === zig.length, pair)
check("proportional series correlate fully", close(pair.matrix[0]![1], 1))
check("the diagonal is 1", pair.matrix[1]![1] === 1)
const apart = returnCorrelations(
  [
    { candles: bars([1, 2, 3, 4], 0), offset: 0 },
    { candles: bars([1, 2, 3, 4], 100 * DAY), offset: 0 },
  ],
  DAY
)
const recent = returnCorrelations(
  [
    { candles: early, offset: 0 },
    { candles: late, offset: 0 },
  ],
  DAY,
  4
)
check("limits to the latest shared bars", recent.bars === 4, recent)
check("nothing shared is no answer", apart.matrix[0]![1] === null, apart)

section("technicalSummary")
const up = technicalSummary(
  bars(Array.from({ length: 250 }, (_, i) => 100 + i * 0.8 + Math.sin(i) * 2))
)!
check("a steady uptrend reads bullish", up.score > 0, up.score)
check("with a buying verdict", up.verdict.startsWith("Mua"), up.verdict)
check("has a 200-bar average", up.sma200 !== null)
check("support below resistance", up.support < up.resistance)
const down = technicalSummary(
  bars(Array.from({ length: 250 }, (_, i) => 400 - i * 0.8 + Math.sin(i) * 2))
)!
check("a steady downtrend reads bearish", down.score < 0, down.score)
const short = technicalSummary(bars([1, 2, 3, 4, 5]))!
check(
  "a short series still summarises",
  short.sma200 === null && short.last === 5
)
check(
  "verdict thresholds",
  verdictOf(1) === "Mua mạnh" &&
    verdictOf(0) === "Trung lập" &&
    verdictOf(-1) === "Bán mạnh"
)

finish()
