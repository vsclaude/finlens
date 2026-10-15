/**
 * The portfolio's arithmetic: a ledger of trades in, holdings and profit out.
 * Shared because main needs it to refuse an oversell and to answer the
 * analyst's `get_portfolio`, and the renderer to draw the same numbers.
 *
 * Average-cost accounting: a buy moves the average, a sell realises the
 * difference against it and leaves it alone. FIFO would match what a broker's
 * tax statement says in some countries, but average cost is what Vietnamese
 * brokers show on the holdings screen, which is the number people check
 * against.
 */
import type { BaseCurrency, InstrumentKey, Market, Transaction } from "./api"
import { currencyOf } from "./market"

export type Holding = {
  key: InstrumentKey
  market: Market
  symbol: string
  currency: string
  quantity: number
  /** Per unit, fees included. */
  avgCost: number
  /** What the quantity still held cost: `quantity × avgCost`. */
  costBasis: number
  /** Gains taken by selling, after fees. */
  realizedPnl: number
  fees: number
  trades: number
}

/** Oldest first; same-day trades keep the order they were entered in. */
export function sortLedger(transactions: Transaction[]): Transaction[] {
  return transactions
    .map((each, index) => ({ each, index }))
    .sort((a, b) => a.each.date.localeCompare(b.each.date) || a.index - b.index)
    .map(({ each }) => each)
}

/** Below this a quantity is float dust, not a position. */
const EPSILON = 1e-9

/**
 * Walks the ledger. Throws on a sell of more than is held at that point,
 * naming the trade — a ledger that goes negative has no meaningful average.
 */
export function computeHoldings(transactions: Transaction[]): Holding[] {
  const byKey = new Map<InstrumentKey, Holding>()
  for (const trade of sortLedger(transactions)) {
    let holding = byKey.get(trade.key)
    if (!holding) {
      holding = {
        key: trade.key,
        market: trade.market,
        symbol: trade.symbol,
        currency: currencyOf(trade.market, trade.symbol),
        quantity: 0,
        avgCost: 0,
        costBasis: 0,
        realizedPnl: 0,
        fees: 0,
        trades: 0,
      }
      byKey.set(trade.key, holding)
    }
    holding.trades += 1
    holding.fees += trade.fee
    if (trade.side === "buy") {
      const cost = holding.costBasis + trade.quantity * trade.price + trade.fee
      holding.quantity += trade.quantity
      holding.costBasis = cost
      holding.avgCost = cost / holding.quantity
    } else {
      if (trade.quantity > holding.quantity + EPSILON) {
        throw new Error(
          `Bán ${trade.quantity} ${trade.symbol} ngày ${trade.date.slice(0, 10)} nhưng chỉ đang nắm giữ ${holding.quantity}`
        )
      }
      holding.realizedPnl +=
        trade.quantity * (trade.price - holding.avgCost) - trade.fee
      holding.quantity -= trade.quantity
      if (holding.quantity < EPSILON) {
        holding.quantity = 0
        holding.costBasis = 0
        holding.avgCost = 0
      } else {
        holding.costBasis = holding.quantity * holding.avgCost
      }
    }
  }
  return [...byKey.values()]
}

/**
 * An amount in `currency` in the base currency, or null when there is no rate
 * for it. `usdVnd` is đồng per dollar.
 */
export function toBase(
  amount: number,
  currency: string,
  base: BaseCurrency,
  usdVnd: number | null
): number | null {
  if (currency === base) return amount
  if (!usdVnd) return null
  if (currency === "USD" && base === "VND") return amount * usdVnd
  if (currency === "VND" && base === "USD") return amount / usdVnd
  return null
}

export type Position = Holding & {
  price: number | null
  marketValue: number | null
  unrealizedPnl: number | null
  unrealizedPct: number | null
  /** In the base currency, null without a price or a rate. */
  valueBase: number | null
  /** Share of the portfolio's priced value, 0–1. */
  weight: number
}

export type Valuation = {
  positions: Position[]
  /** Positions with something still held, largest first. */
  open: Position[]
  base: BaseCurrency
  totalValue: number
  totalCost: number
  unrealizedPnl: number
  realizedPnl: number
  /** Holdings left out of the totals for want of a price or a rate. */
  unpriced: string[]
}

/** Holdings marked to `prices`, with totals in `base`. */
export function valuePortfolio(
  holdings: Holding[],
  prices: Map<InstrumentKey, number>,
  base: BaseCurrency,
  usdVnd: number | null
): Valuation {
  let totalValue = 0
  let totalCost = 0
  let unrealized = 0
  let realized = 0
  const unpriced: string[] = []

  const positions: Position[] = holdings.map((holding) => {
    const price = prices.get(holding.key) ?? null
    const marketValue = price == null ? null : price * holding.quantity
    const unrealizedPnl =
      marketValue == null ? null : marketValue - holding.costBasis
    const valueBase =
      marketValue == null
        ? null
        : toBase(marketValue, holding.currency, base, usdVnd)
    const costBase = toBase(holding.costBasis, holding.currency, base, usdVnd)
    const realizedBase = toBase(
      holding.realizedPnl,
      holding.currency,
      base,
      usdVnd
    )
    if (realizedBase != null) realized += realizedBase
    if (holding.quantity > 0) {
      if (valueBase == null || costBase == null) unpriced.push(holding.symbol)
      else {
        totalValue += valueBase
        totalCost += costBase
        unrealized += valueBase - costBase
      }
    }
    return {
      ...holding,
      price,
      marketValue,
      unrealizedPnl,
      unrealizedPct:
        unrealizedPnl == null || holding.costBasis === 0
          ? null
          : (unrealizedPnl / holding.costBasis) * 100,
      valueBase,
      weight: 0,
    }
  })

  for (const position of positions) {
    position.weight =
      totalValue > 0 && position.valueBase != null && position.quantity > 0
        ? position.valueBase / totalValue
        : 0
  }

  return {
    positions,
    open: positions
      .filter((each) => each.quantity > 0)
      .sort((a, b) => (b.valueBase ?? 0) - (a.valueBase ?? 0)),
    base,
    totalValue,
    totalCost,
    unrealizedPnl: unrealized,
    realizedPnl: realized,
    unpriced,
  }
}

/** Vietnamese exchanges match stock orders in lots of 100 shares. */
export const VN_LOT = 100

export type PositionSize = {
  side: "long" | "short"
  quantity: number
  /** What a fill at the stop loses: `quantity × |entry − stop|`. */
  riskAmount: number
  riskPct: number
  positionValue: number
  positionPct: number
  /** True when the risk budget asked for more than the capital can buy. */
  cappedByCapital: boolean
  /** Prices 1R, 2R and 3R from the entry, in the trade's direction. */
  targets: number[]
}

/**
 * Fixed-fractional sizing: as many units as lose `riskPct` of `capital` if
 * the stop is hit, rounded down to whole `lot`s and never more than the
 * capital buys. Arithmetic the model is not left to do — a misplaced zero in
 * a position size is the one mistake that costs real money.
 */
export function positionSize(input: {
  capital: number
  riskPct: number
  entry: number
  stop: number
  lot?: number
}): PositionSize | null {
  const { capital, riskPct, entry, stop } = input
  const lot = input.lot && input.lot > 0 ? input.lot : 1
  const perUnit = Math.abs(entry - stop)
  if (!(capital > 0 && riskPct > 0 && entry > 0 && stop > 0 && perUnit > 0)) {
    return null
  }
  const byRisk = Math.floor((capital * riskPct) / 100 / perUnit / lot) * lot
  const byCapital = Math.floor(capital / entry / lot) * lot
  const quantity = Math.min(byRisk, byCapital)
  const direction = stop < entry ? 1 : -1
  const riskAmount = quantity * perUnit
  const positionValue = quantity * entry
  return {
    side: direction === 1 ? "long" : "short",
    quantity,
    riskAmount,
    riskPct: (riskAmount / capital) * 100,
    positionValue,
    positionPct: (positionValue / capital) * 100,
    cappedByCapital: byCapital < byRisk,
    targets: [1, 2, 3].map((r) => entry + direction * r * perUnit),
  }
}
