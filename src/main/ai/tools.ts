import { z } from "zod"

import type { InstrumentKey, Interval } from "../../shared/api"
import { performanceStats, technicalSummary } from "../../shared/indicators"
import { parseKey, USD_VND_KEY } from "../../shared/market"
import {
  computeHoldings,
  sortLedger,
  valuePortfolio,
} from "../../shared/portfolio"
import type { MarketData } from "../market/market-data"
import type { Portfolio } from "../portfolio"
import type { SettingsStore } from "../settings"
import type { Watchlist } from "../watchlist"

type Sdk = typeof import("@anthropic-ai/claude-agent-sdk")

export type ToolContext = {
  market: MarketData
  watchlist: Watchlist
  portfolio: Portfolio
  settings: SettingsStore
}

/** The MCP server's name, which prefixes every tool: `mcp__finlens__…`. */
export const SERVER = "finlens"

const INTERVALS = ["1h", "4h", "1d", "1w"] as const

const KEY_HELP =
  "Instrument key `market:symbol` — crypto:BTCUSDT, vn:FPT, vn:VNINDEX, us:AAPL, us:^GSPC"

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true }
}

/** Rounded to what a reader can use — ten significant digits of a price is
 * tokens spent on noise. */
function round(value: number | null | undefined, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value === 0) return 0
  const magnitude = Math.floor(Math.log10(Math.abs(value)))
  const places = Math.max(0, digits - 1 - magnitude)
  return Number(value.toFixed(Math.min(places, 10)))
}

function checkKey(key: string): string | null {
  return parseKey(key) ? null : `Bad key "${key}". ${KEY_HELP}`
}

const isoDate = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 16)

/**
 * The analyst's window on the app: market data, the watchlist and the
 * portfolio, as in-process MCP tools.
 *
 * Read-only on purpose. The model can look at anything the user can see and
 * change nothing — a trade it "records" would be a trade nobody made.
 */
export function analystTools(sdk: Sdk, ctx: ToolContext) {
  const { tool, createSdkMcpServer } = sdk

  const getQuotes = tool(
    "get_quotes",
    "Live quotes (price, change since previous close or 24h, day high/low, volume) for up to 20 instruments.",
    { keys: z.array(z.string()).min(1).max(20).describe(KEY_HELP) },
    async ({ keys }) => {
      const bad = keys.map(checkKey).find(Boolean)
      if (bad) return failure(bad)
      const quotes = await ctx.market.quotes(keys)
      const missing = keys.filter((key) => !quotes.some((q) => q.key === key))
      return json({
        quotes: quotes.map((q) => ({
          key: q.key,
          name: q.name,
          price: round(q.price, 6),
          change: round(q.change),
          changePct: round(q.changePct, 3),
          high: round(q.high, 6),
          low: round(q.low, 6),
          volume: Math.round(q.volume),
          currency: q.currency,
          asOf: isoDate(q.time),
        })),
        ...(missing.length ? { notFound: missing } : {}),
      })
    }
  )

  const getTechnicals = tool(
    "get_technicals",
    "Technical analysis of one instrument at one timeframe: SMA20/50/200, RSI14, MACD, Bollinger, ATR, support/resistance, volume ratio, rule-based signals with an overall score, plus the last 40 candles.",
    {
      key: z.string().describe(KEY_HELP),
      interval: z.enum(INTERVALS).default("1d"),
    },
    async ({ key, interval }) => {
      const bad = checkKey(key)
      if (bad) return failure(bad)
      const candles = await ctx.market.candles(key, interval as Interval)
      const summary = technicalSummary(candles)
      if (!summary) return failure(`No candles for ${key} at ${interval}`)
      const r = (value: number | null) => round(value, 6)
      return json({
        key,
        interval,
        summary: {
          ...summary,
          last: r(summary.last),
          sma20: r(summary.sma20),
          sma50: r(summary.sma50),
          sma200: r(summary.sma200),
          rsi14: round(summary.rsi14, 3),
          macd: summary.macd && {
            macd: r(summary.macd.macd),
            signal: r(summary.macd.signal),
            histogram: r(summary.macd.histogram),
          },
          bollinger: summary.bollinger && {
            upper: r(summary.bollinger.upper),
            middle: r(summary.bollinger.middle),
            lower: r(summary.bollinger.lower),
            percentB: round(summary.bollinger.percentB, 3),
          },
          atr14: r(summary.atr14),
          atrPct: round(summary.atrPct, 3),
          support: r(summary.support),
          resistance: r(summary.resistance),
          rangeHigh: r(summary.rangeHigh),
          rangeLow: r(summary.rangeLow),
          volumeRatio: round(summary.volumeRatio, 3),
          score: round(summary.score, 3),
          change: {
            bars1: round(summary.change.bars1, 3),
            bars7: round(summary.change.bars7, 3),
            bars30: round(summary.change.bars30, 3),
          },
        },
        recentCandles: candles.slice(-40).map((bar) => ({
          t: isoDate(bar.time),
          o: r(bar.open),
          h: r(bar.high),
          l: r(bar.low),
          c: r(bar.close),
          v: Math.round(bar.volume),
        })),
      })
    }
  )

  const comparePerformance = tool(
    "compare_performance",
    "Compare instruments over the same window: total return, bar-to-bar volatility and maximum drawdown over the last N bars.",
    {
      keys: z.array(z.string()).min(1).max(10).describe(KEY_HELP),
      interval: z.enum(INTERVALS).default("1d"),
      bars: z.number().int().min(5).max(500).default(90),
    },
    async ({ keys, interval, bars }) => {
      const bad = keys.map(checkKey).find(Boolean)
      if (bad) return failure(bad)
      const rows = await Promise.all(
        keys.map(async (key) => {
          try {
            const candles = (
              await ctx.market.candles(key, interval as Interval)
            ).slice(-bars)
            const stats = performanceStats(candles)
            return stats
              ? {
                  key,
                  from: isoDate(candles[0]!.time),
                  bars: stats.bars,
                  returnPct: round(stats.returnPct, 3),
                  volatilityPct: round(stats.volatilityPct, 3),
                  maxDrawdownPct: round(stats.maxDrawdownPct, 3),
                }
              : { key, error: "not enough data" }
          } catch (error) {
            return { key, error: String(error) }
          }
        })
      )
      return json({ interval, rows })
    }
  )

  const cryptoOverview = tool(
    "get_crypto_overview",
    "The crypto market at a glance: top 30 coins by market cap with 24h and 7d change, and the Fear & Greed index with its last 30 days.",
    {},
    async () => {
      const [coins, fear] = await Promise.allSettled([
        ctx.market.coinMarkets(),
        ctx.market.fearGreed(),
      ])
      const list = coins.status === "fulfilled" ? coins.value : []
      const total = list.reduce((sum, coin) => sum + coin.marketCap, 0)
      return json({
        topCoins: list.slice(0, 30).map((coin) => ({
          rank: coin.rank,
          symbol: coin.symbol,
          name: coin.name,
          priceUsd: round(coin.price, 6),
          marketCapUsd: Math.round(coin.marketCap),
          change24hPct: round(coin.change24h, 3),
          change7dPct: round(coin.change7d, 3),
        })),
        // Of the top 60 only, which is close to — not the same as — the
        // dominance figure sites quote against the whole market.
        btcShareOfTop60Pct: total
          ? round(
              ((list.find((coin) => coin.symbol === "BTC")?.marketCap ?? 0) /
                total) *
                100,
              3
            )
          : null,
        fearGreed:
          fear.status === "fulfilled"
            ? {
                value: fear.value.value,
                label: fear.value.label,
                last30Days: fear.value.history.map((each) => each.value),
              }
            : null,
        ...(coins.status === "rejected"
          ? { coinsError: String(coins.reason) }
          : {}),
      })
    }
  )

  const getWatchlist = tool(
    "get_watchlist",
    "The instruments the user watches, with live quotes.",
    {},
    async () => {
      const items = await ctx.watchlist.list()
      const quotes = await ctx.market.quotes(items.map((each) => each.key))
      return json(
        items.map((item) => {
          const quote = quotes.find((q) => q.key === item.key)
          return {
            key: item.key,
            name: item.name,
            price: round(quote?.price, 6),
            changePct: round(quote?.changePct, 3),
            currency: quote?.currency,
          }
        })
      )
    }
  )

  const getPortfolio = tool(
    "get_portfolio",
    "The user's portfolio: open positions marked to live prices (quantity, average cost, market value, unrealised P&L, weight), realised P&L, totals in the base currency, and the 30 most recent trades.",
    {},
    async () => {
      const ledger = await ctx.portfolio.list()
      if (ledger.length === 0) {
        return json({ empty: true, note: "The user has recorded no trades." })
      }
      const base = await ctx.settings.get("baseCurrency")
      const holdings = computeHoldings(ledger)
      const keys: InstrumentKey[] = holdings
        .filter((each) => each.quantity > 0)
        .map((each) => each.key)
      const quotes = await ctx.market.quotes([...keys, USD_VND_KEY])
      const prices = new Map(quotes.map((q) => [q.key, q.price]))
      const usdVnd = prices.get(USD_VND_KEY) ?? null
      const valuation = valuePortfolio(holdings, prices, base, usdVnd)
      return json({
        baseCurrency: base,
        usdVnd: round(usdVnd, 6),
        totals: {
          value: round(valuation.totalValue, 8),
          cost: round(valuation.totalCost, 8),
          unrealizedPnl: round(valuation.unrealizedPnl, 8),
          realizedPnl: round(valuation.realizedPnl, 8),
        },
        unpriced: valuation.unpriced,
        positions: valuation.open.map((p) => ({
          key: p.key,
          currency: p.currency,
          quantity: p.quantity,
          avgCost: round(p.avgCost, 6),
          price: round(p.price, 6),
          marketValue: round(p.marketValue, 8),
          unrealizedPnl: round(p.unrealizedPnl, 6),
          unrealizedPct: round(p.unrealizedPct, 3),
          weightPct: round(p.weight * 100, 3),
          realizedPnl: round(p.realizedPnl, 6),
        })),
        closedPositions: valuation.positions
          .filter((p) => p.quantity === 0)
          .map((p) => ({
            key: p.key,
            currency: p.currency,
            realizedPnl: round(p.realizedPnl, 6),
          })),
        recentTrades: sortLedger(ledger)
          .slice(-30)
          .map((t) => ({
            date: t.date.slice(0, 10),
            key: t.key,
            side: t.side,
            quantity: t.quantity,
            price: t.price,
            fee: t.fee,
            ...(t.note ? { note: t.note } : {}),
          })),
      })
    }
  )

  return createSdkMcpServer({
    name: SERVER,
    version: "1.0.0",
    // Six small tools: cheaper to always list than to make the model search.
    alwaysLoad: true,
    tools: [
      getQuotes,
      getTechnicals,
      comparePerformance,
      cryptoOverview,
      getWatchlist,
      getPortfolio,
    ],
  })
}
