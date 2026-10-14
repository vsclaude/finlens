/**
 * How numbers read across the app. Pure, and covered by `test/format.ts`.
 *
 * en-US grouping (`57,100`) rather than vi-VN (`57.100`): it is what Binance
 * and the Vietnamese brokers' price boards both show, so a number copied from
 * here reads the same there.
 */

const cache = new Map<string, Intl.NumberFormat>()
function formatter(min: number, max: number): Intl.NumberFormat {
  const id = `${min}:${max}`
  let format = cache.get(id)
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    })
    cache.set(id, format)
  }
  return format
}

/**
 * Decimals a price needs: none for đồng, two for index points and most
 * dollar prices, and enough significant digits for a coin worth a
 * fraction of a cent that it does not read as `0.00`.
 */
export function priceDecimals(value: number, currency: string): number {
  if (currency === "VND") return 0
  const abs = Math.abs(value)
  if (abs === 0 || abs >= 1) return 2
  return Math.min(10, 1 - Math.floor(Math.log10(abs)) + 2)
}

export function formatPrice(
  value: number | null | undefined,
  currency = "USD"
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const digits = priceDecimals(value, currency)
  return formatter(digits, digits).format(value)
}

/** A price with its currency marked: `$1,234.50`, `57,100 ₫`, `1,704.87`. */
export function formatMoney(
  value: number | null | undefined,
  currency = "USD"
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const text = formatPrice(Math.abs(value), currency)
  const sign = value < 0 ? "−" : ""
  if (currency === "USD") return `${sign}$${text}`
  if (currency === "VND") return `${sign}${text} ₫`
  if (currency === "PTS") return `${sign}${text}`
  return `${sign}${text} ${currency}`
}

/** `+1.23%` / `−0.40%`, a true minus sign so a column of them lines up. */
export function formatPct(
  value: number | null | undefined,
  digits = 2
): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const text = formatter(digits, digits).format(Math.abs(value))
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}%`
}

/** `1.2T`, `340.5B`, `12.3M`, `8.1K` — for market caps and volumes. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  const sign = value < 0 ? "−" : ""
  for (const [size, suffix] of [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (abs >= size)
      return `${sign}${formatter(1, 1).format(abs / size)}${suffix}`
  }
  return `${sign}${formatter(0, 2).format(abs)}`
}

/** A quantity held: whole numbers for shares, up to eight places for coins. */
export function formatQuantity(value: number): string {
  return formatter(0, 8).format(value)
}

/** Which way a change points, for colouring it. */
export function direction(
  value: number | null | undefined
): "up" | "down" | "flat" {
  if (value == null || !Number.isFinite(value) || value === 0) return "flat"
  return value > 0 ? "up" : "down"
}
