/**
 * The one way main fetches market data: JSON over GET, with a timeout and a
 * browser's user agent.
 *
 * The user agent is not decoration — Yahoo answers a bare `node` client with
 * 429s, and VNDirect with an empty body. Nor is the `Accept`: VNDirect serves
 * its JSON as something else and answers a strict `application/json` with a
 * 406, so the fallback `*` is what lets it through. The timeout is because a
 * provider that hangs would otherwise hold a chart's spinner for the length
 * of the OS's TCP timeout, which is minutes.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"

export type Fetch = (url: string) => Promise<unknown>

export const getJson: Fetch = async (url) => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    // The provider's own reason when it gives one (Binance: `msg`, Yahoo:
    // `chart.error.description`) — "answered 400" alone says nothing.
    const body = (await response.json().catch(() => null)) as {
      msg?: string
      chart?: { error?: { description?: string } }
    } | null
    const reason = body?.msg ?? body?.chart?.error?.description
    throw new Error(
      `${new URL(url).host} answered ${response.status}${reason ? `: ${reason}` : ""}`
    )
  }
  // Read as text first: a provider that refuses a request in prose with a
  // 200 (VNDirect's "Not support resolution W") should fail with its words,
  // not with `JSON.parse` complaining about the letter N.
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${new URL(url).host}: ${text.trim().slice(0, 120)}`)
  }
}

/** A finite number from a provider's field, which may be a string. */
export function num(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0
}
