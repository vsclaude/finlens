/**
 * The market-data providers' parsers against payloads shaped like the real
 * ones (trimmed from live responses), symbol handling, and the cache —
 * none of it over the network.
 */
import type { Fetch } from "../src/main/market/http"
import { parseKlines, parseTicker } from "../src/main/market/binance"
import { parseCoinMarkets, parseFearGreed } from "../src/main/market/coingecko"
import { MarketData } from "../src/main/market/market-data"
import {
  parseUdf,
  quoteFromCandles,
  vndirectCandles,
} from "../src/main/market/vndirect"
import { parseChart, parseChartQuote } from "../src/main/market/yahoo"
import {
  baseAsset,
  currencyOf,
  normalizeCryptoSymbol,
  normalizeStockSymbol,
  parseKey,
} from "../src/shared/market"
import { check, finish, section } from "./harness"

section("Symbols")
check(
  "a bare coin is quoted in USDT",
  normalizeCryptoSymbol("btc") === "BTCUSDT"
)
check("a pair keeps its quote", normalizeCryptoSymbol("eth/btc") === "ETHBTC")
check("FDUSD is not USD", normalizeCryptoSymbol("BTCFDUSD") === "BTCFDUSD")
check(
  "the asset alone is not a pair",
  normalizeCryptoSymbol("usdt") === "USDTUSDT"
)
check(
  "baseAsset strips the quote",
  baseAsset("SOLUSDT") === "SOL" && baseAsset("ETHBTC") === "ETH"
)
check(
  "stock symbols keep ^ and =",
  normalizeStockSymbol(" ^gspc ") === "^GSPC" &&
    normalizeStockSymbol("usdvnd=x") === "USDVND=X"
)
check(
  "parseKey splits at the first colon",
  JSON.stringify(parseKey("us:USDVND=X")) ===
    '{"market":"us","symbol":"USDVND=X"}'
)
check(
  "parseKey refuses an unknown market",
  parseKey("forex:EURUSD") === null && parseKey("BTC") === null
)
check(
  "đồng for VN stocks, points for indices",
  currencyOf("vn", "FPT") === "VND" && currencyOf("vn", "VNINDEX") === "PTS"
)
check(
  "an FX pair is in its quote currency",
  currencyOf("us", "USDVND=X") === "VND"
)
check(
  "a BTC pair is in BTC",
  currencyOf("crypto", "ETHBTC") === "BTC" &&
    currencyOf("crypto", "ETHUSDT") === "USD"
)

section("Binance")
const klines = parseKlines([
  [
    1791849600000,
    "81850.01",
    "84168.00",
    "81033.66",
    "83169.00",
    "14784.06",
    1791935999999,
    "1230595670.84",
    3094331,
    "7522.54",
    "626232475.31",
    "0",
  ],
])
check(
  "klines become seconds and numbers",
  klines[0]?.time === 1791849600 && klines[0]?.close === 83169,
  klines[0]
)
const ticker = parseTicker({
  symbol: "BTCUSDT",
  lastPrice: "81700.01",
  priceChange: "-1646.0",
  priceChangePercent: "-1.975",
  highPrice: "84146.72",
  lowPrice: "81666.66",
  quoteVolume: "1386719605.36",
  closeTime: 1791992658013,
})
check(
  "a ticker is a quote",
  ticker.key === "crypto:BTCUSDT" &&
    ticker.price === 81700.01 &&
    ticker.changePct === -1.975,
  ticker
)
check("named by its asset", ticker.name === "BTC")

section("VNDirect")
const udf = {
  t: [1791763200, 1791849600],
  o: [58.1, 57.1],
  h: [58.8, 57.4],
  l: [57.1, 56.1],
  c: [57.1, 56.3],
  v: [5975008, 6775400],
  s: "ok",
}
const fpt = parseUdf(udf, "FPT")
check("stocks are scaled to đồng", fpt[1]?.close === 56_300, fpt[1])
check("indices are left in points", parseUdf(udf, "VNINDEX")[1]?.close === 56.3)
check("no data is no candles", parseUdf({ s: "no_data" }, "FPT").length === 0)
const vnQuote = quoteFromCandles("vn", "FPT", "FPT", fpt)!
check(
  "a quote is the last bar against the one before",
  vnQuote.price === 56_300 && vnQuote.change === -800,
  vnQuote
)
const hourly = await vndirectCandles(
  async () => ({
    s: "ok",
    t: [0, 3600, 7200, 14400],
    o: [1, 2, 3, 4],
    h: [1, 2, 3, 4],
    l: [1, 2, 3, 4],
    c: [1, 2, 3, 4],
    v: [1, 1, 1, 1],
  }),
  "VNINDEX",
  "4h",
  10_000_000
)
check(
  "4h is built from hourly bars",
  hourly.length === 2 && hourly[0]!.close === 3,
  hourly
)
// Mon 6 – Fri 10 Oct 2025, then Mon 13 Oct: two weeks.
const days = [
  1759708800, 1759795200, 1759881600, 1759968000, 1760054400, 1760313600,
]
let weeklyUrl = ""
const weekly = await vndirectCandles(
  async (url) => {
    weeklyUrl = url
    return {
      s: "ok",
      t: days,
      o: [1, 2, 3, 4, 5, 6],
      h: [1, 2, 3, 4, 5, 6],
      l: [1, 2, 3, 4, 5, 6],
      c: [1, 2, 3, 4, 5, 6],
      v: [1, 1, 1, 1, 1, 1],
    }
  },
  "VNINDEX",
  "1w",
  1_800_000_000
)
check(
  "a week asks for days — the feed has no W",
  weeklyUrl.includes("resolution=D"),
  weeklyUrl
)
check(
  "and folds them into Monday-to-Friday weeks",
  weekly.length === 2 &&
    weekly[0]!.time === days[0] &&
    weekly[0]!.close === 5 &&
    weekly[1]!.open === 6,
  weekly
)

section("Yahoo")
const chart = {
  chart: {
    result: [
      {
        meta: {
          symbol: "AAPL",
          currency: "USD",
          shortName: "Apple Inc.",
          regularMarketPrice: 345.47,
          chartPreviousClose: 341.27,
          regularMarketTime: 1791992658,
        },
        timestamp: [1791720000, 1791806400, 1791892800],
        indicators: {
          quote: [
            {
              open: [1, null, 3],
              high: [1, null, 3],
              low: [1, null, 3],
              close: [1, null, 3],
              volume: [10, null, 30],
            },
          ],
        },
      },
    ],
  },
}
check("null bars are dropped", parseChart(chart).length === 2)
const aapl = parseChartQuote(chart)
check(
  "the quote is against the previous close",
  Math.abs(aapl.change - 4.2) < 1e-9 && aapl.name === "Apple Inc.",
  aapl
)
let yahooThrew = ""
try {
  parseChart({
    chart: {
      result: null,
      error: { description: "No data found, symbol may be delisted" },
    },
  })
} catch (error) {
  yahooThrew = String(error)
}
check(
  "an unknown symbol throws Yahoo's reason",
  yahooThrew.includes("delisted"),
  yahooThrew
)

section("CoinGecko / Fear & Greed")
const coins = parseCoinMarkets([
  {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    image: "x",
    market_cap_rank: 1,
    current_price: 81671,
    market_cap: 1.6e12,
    total_volume: 3e10,
    price_change_percentage_24h_in_currency: -1.9,
    price_change_percentage_7d_in_currency: 2.1,
    sparkline_in_7d: { price: [1, 2] },
  },
])
check(
  "symbols are upper-cased",
  coins[0]?.symbol === "BTC" && coins[0]?.change7d === 2.1,
  coins[0]
)
const fear = parseFearGreed({
  data: [
    { value: "62", value_classification: "Greed", timestamp: "1791936000" },
    { value: "57", value_classification: "Greed", timestamp: "1791849600" },
  ],
})
check(
  "the latest value, labelled in Vietnamese",
  fear.value === 62 && fear.label === "Tham lam",
  fear
)
check("history oldest first", fear.history[0]?.value === 57)

section("MarketData — routing and cache")
const asked: string[] = []
const fakeFetch: Fetch = async (url) => {
  asked.push(url)
  if (url.includes("ticker/24hr")) {
    const symbols = JSON.parse(
      decodeURIComponent(new URL(url).searchParams.get("symbols") ?? "[]")
    ) as string[]
    if (symbols.includes("NOPEUSDT")) throw new Error("400 invalid symbol")
    return symbols.map((symbol) => ({
      symbol,
      lastPrice: "1",
      priceChange: "0",
      priceChangePercent: "0",
      highPrice: "1",
      lowPrice: "1",
      quoteVolume: "1",
      closeTime: 0,
    }))
  }
  if (url.includes("vndirect")) return udf
  throw new Error("404")
}
const data = new MarketData(fakeFetch)
const quotes = await data.quotes([
  "crypto:ETHUSDT",
  "vn:FPT",
  "crypto:BTCUSDT",
  "us:NOPE",
])
check(
  "answers in the order asked, failures left out",
  quotes.map((q) => q.key).join() === "crypto:ETHUSDT,vn:FPT,crypto:BTCUSDT",
  quotes.map((q) => q.key)
)
check(
  "crypto in one batched request",
  asked.filter((url) => url.includes("ticker/24hr")).length === 1
)
const before = asked.length
await data.quotes(["crypto:BTCUSDT", "crypto:ETHUSDT", "vn:FPT"])
check(
  "a repeat within the TTL is cached",
  asked.length === before,
  asked.length - before
)
await data.quotes(["us:NOPE"])
check("a failure is not cached", asked.length === before + 1)
const mixed = await data.quotes(["crypto:SOLUSDT", "crypto:NOPEUSDT"])
check(
  "one bad pair does not sink the batch",
  mixed.length === 1 && mixed[0]?.key === "crypto:SOLUSDT",
  mixed
)

section("Coins Binance does not list")
const geckoRow = (symbol: string) => ({
  id: symbol.toLowerCase(),
  symbol: symbol.toLowerCase(),
  name: symbol,
  image: "",
  market_cap_rank: 1,
  current_price: 1,
  market_cap: 1,
  total_volume: 1,
})
const listing =
  (pairsFail: boolean): Fetch =>
  async (url) => {
    if (url.includes("coingecko"))
      return [geckoRow("BTC"), geckoRow("USDT"), geckoRow("LEO")]
    if (url.includes("ticker/price")) {
      if (pairsFail) throw new Error("503")
      return [
        { symbol: "BTCUSDT", price: "1" },
        { symbol: "ETHBTC", price: "1" },
      ]
    }
    if (url.includes("klines")) {
      throw new Error("data-api.binance.vision answered 400: Invalid symbol.")
    }
    throw new Error("404")
  }
const listed = await new MarketData(listing(false)).coinMarkets()
check(
  "a listed coin gets its pair",
  listed.find((coin) => coin.symbol === "BTC")?.pair === "BTCUSDT"
)
check(
  "an unlisted one gets none",
  listed
    .filter((coin) => coin.pair === null)
    .map((coin) => coin.symbol)
    .join() === "USDT,LEO",
  listed.map((coin) => coin.pair)
)
const guessed = await new MarketData(listing(true)).coinMarkets()
check(
  "without Binance's list every coin keeps a guess",
  guessed.every((coin) => coin.pair === `${coin.symbol}USDT`)
)
let unlistedError = ""
try {
  await new MarketData(listing(false)).candles("crypto:LEOUSDT", "1d")
} catch (error) {
  unlistedError = String(error)
}
check(
  "an unlisted chart says so in words",
  unlistedError.includes("Binance không niêm yết cặp LEOUSDT"),
  unlistedError
)

finish()
