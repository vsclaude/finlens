import type { CoinMarket, FearGreed } from "../../shared/api"
import { num, type Fetch } from "./http"

/**
 * CoinGecko's market table, for the market page's heatmap: market caps and
 * a week of prices for the top coins in one request. Keyless, and rate-limited
 * to a handful of calls a minute, which the cache in `market-data.ts` stays
 * well under.
 */
const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=true&price_change_percentage=24h,7d"

type Row = {
  id: string
  symbol: string
  name: string
  image: string
  market_cap_rank: number
  current_price: number
  market_cap: number
  total_volume: number
  price_change_percentage_24h_in_currency?: number
  price_change_percentage_24h?: number
  price_change_percentage_7d_in_currency?: number
  sparkline_in_7d?: { price?: number[] }
}

export function parseCoinMarkets(json: unknown): CoinMarket[] {
  if (!Array.isArray(json)) throw new Error("CoinGecko: unexpected markets")
  return (json as Row[]).map((row) => ({
    id: row.id,
    symbol: row.symbol.toUpperCase(),
    name: row.name,
    image: row.image,
    rank: num(row.market_cap_rank),
    price: num(row.current_price),
    marketCap: num(row.market_cap),
    volume: num(row.total_volume),
    change24h: num(
      row.price_change_percentage_24h_in_currency ??
        row.price_change_percentage_24h
    ),
    change7d: num(row.price_change_percentage_7d_in_currency),
    sparkline: row.sparkline_in_7d?.price ?? [],
    // Filled in by `MarketData`, which knows what Binance lists.
    pair: null,
  }))
}

export async function coinMarkets(fetchJson: Fetch): Promise<CoinMarket[]> {
  return parseCoinMarkets(await fetchJson(MARKETS_URL))
}

const FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=30"

/** The labels alternative.me uses, in Vietnamese. */
const LABELS: Record<string, string> = {
  "Extreme Fear": "Cực kỳ sợ hãi",
  Fear: "Sợ hãi",
  Neutral: "Trung lập",
  Greed: "Tham lam",
  "Extreme Greed": "Cực kỳ tham lam",
}

export function parseFearGreed(json: unknown): FearGreed {
  const data = (
    json as {
      data?: {
        value: string
        value_classification: string
        timestamp: string
      }[]
    }
  )?.data
  if (!data?.length) throw new Error("Fear & Greed: no data")
  const latest = data[0]!
  return {
    value: num(latest.value),
    label: LABELS[latest.value_classification] ?? latest.value_classification,
    // Oldest first, as every other series in the app is.
    history: data
      .map((each) => ({ time: num(each.timestamp), value: num(each.value) }))
      .reverse(),
  }
}

export async function fearGreed(fetchJson: Fetch): Promise<FearGreed> {
  return parseFearGreed(await fetchJson(FEAR_GREED_URL))
}
