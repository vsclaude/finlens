import type {
  Candle,
  CoinMarket,
  FearGreed,
  Instrument,
  InstrumentKey,
  Interval,
  Market,
  Quote,
} from "../../shared/api"
import {
  baseAsset,
  normalizeCryptoSymbol,
  normalizeStockSymbol,
  parseKey,
  toKey,
} from "../../shared/market"
import { binanceCandles, binancePairs, binanceQuotes } from "./binance"
import { coinMarkets, fearGreed } from "./coingecko"
import { getJson, type Fetch } from "./http"
import { vndirectCandles, vndirectQuote } from "./vndirect"
import { yahooCandles, yahooQuote } from "./yahoo"

/** How long an answer is reused, by what it is. Quotes move; a week of
 * CoinGecko sparklines and a daily sentiment index do not. */
const TTL = {
  quote: 15_000,
  candles: 60_000,
  coins: 120_000,
  fearGreed: 30 * 60_000,
  pairs: 60 * 60_000,
}

/**
 * Every market-data question main answers, routed to its provider and cached.
 *
 * The cache holds the *promise*, so the dashboard asking for twelve quotes
 * while the chart page asks for the same one is one request, not two. A
 * failed request is dropped from the cache at once rather than remembered for
 * its TTL — a blip should not blank a panel for two minutes.
 *
 * Free of `electron`; `fetchJson` is injectable so nothing here needs the
 * network to be constructed.
 */
export class MarketData {
  private readonly cache = new Map<
    string,
    { at: number; value: Promise<unknown> }
  >()

  constructor(private readonly fetchJson: Fetch = getJson) {}

  private cached<T>(
    id: string,
    ttl: number,
    load: () => Promise<T>
  ): Promise<T> {
    const hit = this.cache.get(id)
    if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>
    const value = load()
    this.cache.set(id, { at: Date.now(), value })
    value.catch(() => {
      if (this.cache.get(id)?.value === value) this.cache.delete(id)
    })
    return value
  }

  async candles(key: InstrumentKey, interval: Interval): Promise<Candle[]> {
    const parsed = parseKey(key)
    if (!parsed) throw new Error(`Không nhận ra mã: ${key}`)
    const { market, symbol } = parsed
    return this.cached(`candles:${key}:${interval}`, TTL.candles, () => {
      if (market === "crypto")
        return binanceCandles(this.fetchJson, symbol, interval)
      if (market === "vn")
        return vndirectCandles(this.fetchJson, symbol, interval)
      return yahooCandles(this.fetchJson, symbol, interval)
    })
  }

  /** Every key it can answer for, in the order asked; the rest left out. */
  async quotes(keys: InstrumentKey[]): Promise<Quote[]> {
    const unique = [...new Set(keys)]
    const crypto = unique
      .map(parseKey)
      .filter((each) => each?.market === "crypto")
      .map((each) => each!.symbol)
      .sort()

    const found = new Map<InstrumentKey, Quote>()
    const jobs: Promise<void>[] = []

    if (crypto.length) {
      jobs.push(
        this.cached(`quotes:crypto:${crypto.join(",")}`, TTL.quote, () =>
          binanceQuotes(this.fetchJson, crypto)
        )
          .then((quotes) => quotes.forEach((q) => found.set(q.key, q)))
          .catch(() => {})
      )
    }

    for (const key of unique) {
      const parsed = parseKey(key)
      if (!parsed || parsed.market === "crypto") continue
      const { market, symbol } = parsed
      jobs.push(
        this.cached(`quote:${key}`, TTL.quote, () =>
          market === "vn"
            ? vndirectQuote(this.fetchJson, symbol)
            : yahooQuote(this.fetchJson, symbol)
        )
          .then((quote) => {
            // Yahoo may answer for a symbol with its own spelling of it;
            // filing it under the key that was asked is what lets the
            // caller find it.
            if (quote) found.set(key, { ...quote, key, symbol })
          })
          .catch(() => {})
      )
    }

    await Promise.all(jobs)
    return unique.flatMap((key) => found.get(key) ?? [])
  }

  /**
   * CoinGecko's table, each coin with the Binance pair its chart opens. If
   * Binance's list cannot be had, every coin gets its USDT pair as a guess —
   * a chart that may say "not listed" beats a table with nothing clickable.
   */
  coinMarkets(): Promise<CoinMarket[]> {
    return this.cached("coins", TTL.coins, async () => {
      const [coins, pairs] = await Promise.all([
        coinMarkets(this.fetchJson),
        this.cached("pairs", TTL.pairs, () =>
          binancePairs(this.fetchJson)
        ).catch(() => null),
      ])
      return coins.map((coin) => {
        const pair = `${coin.symbol}USDT`
        return { ...coin, pair: !pairs || pairs.has(pair) ? pair : null }
      })
    })
  }

  fearGreed(): Promise<FearGreed> {
    return this.cached("fear-greed", TTL.fearGreed, () =>
      fearGreed(this.fetchJson)
    )
  }

  /**
   * What somebody typed, as an instrument the provider actually has — asked
   * for a quote, since an unknown symbol is the one thing every provider
   * answers differently (a 400, a 404, an empty body).
   */
  async resolve(market: Market, input: string): Promise<Instrument | null> {
    const symbol =
      market === "crypto"
        ? normalizeCryptoSymbol(input)
        : normalizeStockSymbol(input)
    if (!symbol) return null
    const key = toKey(market, symbol)
    const [quote] = await this.quotes([key])
    if (!quote) return null
    return {
      key,
      market,
      symbol,
      name: market === "crypto" ? baseAsset(symbol) : quote.name,
    }
  }
}
