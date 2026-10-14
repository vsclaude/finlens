import { useEffect, useRef, useState } from "react"

import type { Candle, InstrumentKey, Interval, Quote } from "@shared/api"
import { errorMessage } from "@/lib/utils"

export type Loaded<T> = {
  data: T | undefined
  error: string | null
  loading: boolean
}

/**
 * `load` now and every `everyMs` after, while the component is mounted; the
 * repeats are skipped while the window is hidden — a minimised app has no
 * reason to keep polling four providers. The first load never is: Chromium
 * on Windows reports a window that is merely covered by another as hidden,
 * and a page opened then would sit on "loading" until it was uncovered.
 *
 * The last good answer stays on screen through a failed refresh: a quote
 * that blinks to "—" every time the network hiccups is worse than one a few
 * seconds stale. `key` restarts it from scratch (a different symbol).
 */
export function usePolling<T>(
  load: () => Promise<T>,
  key: string,
  everyMs: number | null
): Loaded<T> & { refresh: () => void } {
  // Tagged with the key it answers, so a new key reads as loading without an
  // effect having to reset the state first.
  const [state, setState] = useState<{
    key: string
    data: T | undefined
    error: string | null
  }>({ key: "", data: undefined, error: null })
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true

    const run = () => {
      loadRef
        .current()
        .then((data) => alive && setState({ key, data, error: null }))
        .catch(
          (error: unknown) =>
            alive &&
            setState((prev) => ({
              key,
              data: prev.key === key ? prev.data : undefined,
              error: errorMessage(error),
            }))
        )
    }

    run()
    const timer = everyMs
      ? setInterval(() => !document.hidden && run(), everyMs)
      : null
    const onVisible = () => !document.hidden && run()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [key, everyMs, tick])

  const current = state.key === key
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : null,
    loading: !current,
    refresh: () => setTick((n) => n + 1),
  }
}

/** Quotes refresh every 15s — the cache in main is the same length, so a
 * faster poll would only ever be answered from it. */
export function useQuotes(keys: InstrumentKey[]) {
  const id = keys.join("|")
  const result = usePolling(
    () => (keys.length ? window.desktop.getQuotes(keys) : Promise.resolve([])),
    id,
    15_000
  )
  const byKey = new Map<InstrumentKey, Quote>(
    (result.data ?? []).map((quote) => [quote.key, quote])
  )
  return { ...result, byKey }
}

export function useCandles(
  key: InstrumentKey,
  interval: Interval,
  everyMs = 60_000
) {
  return usePolling<Candle[]>(
    () => window.desktop.getCandles(key, interval),
    `${key}@${interval}`,
    everyMs
  )
}

/** Why a coin from CoinGecko's table does nothing when clicked: the chart
 * comes from Binance, which does not list every coin CoinGecko ranks. */
export const NOT_ON_BINANCE = "Không giao dịch trên Binance — chưa có biểu đồ"
