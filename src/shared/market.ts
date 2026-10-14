/**
 * Instrument identity, shared because both sides spell it: main routes a key
 * to its provider, the renderer files a typed symbol under one, and the
 * analyst's tools take one from the model.
 */
import type { InstrumentKey, Market } from "./api"

export const MARKETS: Market[] = ["crypto", "vn", "us"]

export const MARKET_LABEL: Record<Market, string> = {
  crypto: "Crypto",
  vn: "Chứng khoán VN",
  us: "Chứng khoán Mỹ",
}

export function toKey(market: Market, symbol: string): InstrumentKey {
  return `${market}:${symbol}`
}

/** Null for anything that is not `${market}:${symbol}` with a known market. */
export function parseKey(
  key: string
): { market: Market; symbol: string } | null {
  const at = key.indexOf(":")
  if (at <= 0) return null
  const market = key.slice(0, at) as Market
  const symbol = key.slice(at + 1)
  if (!MARKETS.includes(market) || !symbol) return null
  return { market, symbol }
}

/**
 * The quote assets a Binance pair can end in, longest first so `FDUSD` is not
 * read as a pair against `USD`.
 */
const QUOTE_ASSETS = ["FDUSD", "USDT", "USDC", "BTC", "ETH", "BNB"]

/**
 * What somebody types for a coin — `btc`, `BTC/USDT`, `eth-usdc` — as the
 * Binance pair. A bare asset is quoted in USDT, the deepest book for almost
 * everything listed there.
 */
export function normalizeCryptoSymbol(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!cleaned) return ""
  const hasQuote = QUOTE_ASSETS.some(
    (quote) => cleaned.endsWith(quote) && cleaned.length > quote.length
  )
  return hasQuote ? cleaned : `${cleaned}USDT`
}

/** `BTCUSDT` → `BTC`, for labels. */
export function baseAsset(pair: string): string {
  for (const quote of QUOTE_ASSETS) {
    if (pair.endsWith(quote) && pair.length > quote.length) {
      return pair.slice(0, -quote.length)
    }
  }
  return pair
}

/**
 * VNDirect's index symbols. They are quoted in points, where every stock on
 * the same feed is quoted in thousands of đồng — which is why the provider has
 * to know the difference.
 */
export const VN_INDICES = new Set([
  "VNINDEX",
  "VN30",
  "VN100",
  "VNMID",
  "VNSML",
  "HNX",
  "HNX30",
  "UPCOM",
])

export function normalizeStockSymbol(input: string): string {
  // `^` and `=` survive for Yahoo's indices (`^GSPC`) and FX (`USDVND=X`).
  return input
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9.^=-]/g, "")
}

/** The currency an instrument's prices are in. */
export function currencyOf(market: Market, symbol: string): string {
  if (market === "vn") return VN_INDICES.has(symbol) ? "PTS" : "VND"
  if (market === "crypto") {
    const quote = QUOTE_ASSETS.find(
      (each) => symbol.endsWith(each) && symbol.length > each.length
    )
    return quote && quote !== "USDT" && quote !== "USDC" && quote !== "FDUSD"
      ? quote
      : "USD"
  }
  if (symbol.endsWith("=X") && symbol.length === 8) return symbol.slice(3, 6)
  if (symbol.startsWith("^")) return "PTS"
  return "USD"
}

/** The quote Yahoo has for one US dollar in đồng. */
export const USD_VND_KEY = toKey("us", "USDVND=X")
