import path from "node:path"

import type { Instrument, InstrumentKey, WatchItem } from "../shared/api"
import { toKey } from "../shared/market"
import { JsonFile } from "./json-file"

/**
 * What a first run watches: the two indices and a few names from each market,
 * so the dashboard has something to draw before anybody has added anything.
 * Only ever the fallback for a missing file — once somebody has emptied their
 * watchlist, it stays empty.
 */
const SEED: Instrument[] = (
  [
    ["crypto", "BTCUSDT", "BTC"],
    ["crypto", "ETHUSDT", "ETH"],
    ["crypto", "SOLUSDT", "SOL"],
    ["vn", "VNINDEX", "VN-Index"],
    ["vn", "FPT", "FPT"],
    ["vn", "VCB", "VCB"],
    ["us", "^GSPC", "S&P 500"],
    ["us", "NVDA", "NVIDIA"],
  ] as const
).map(([market, symbol, name]) => ({
  key: toKey(market, symbol),
  market,
  symbol,
  name,
}))

/**
 * `watchlist.json`: the instruments the dashboard and the chart page offer,
 * in the order they were added. Each write answers with the whole list,
 * which `ipc.ts` pushes to every window.
 */
export class Watchlist {
  private readonly file: JsonFile<WatchItem[]>

  constructor(dir: string) {
    const addedAt = new Date().toISOString()
    this.file = new JsonFile(path.join(dir, "watchlist.json"), () =>
      SEED.map((each) => ({ ...each, addedAt }))
    )
  }

  list(): Promise<WatchItem[]> {
    return this.file.read()
  }

  /** Adding what is already there is a no-op, not a duplicate. */
  add(instrument: Instrument): Promise<WatchItem[]> {
    return this.file.update((items) =>
      items.some((each) => each.key === instrument.key)
        ? items
        : [
            ...items,
            {
              key: instrument.key,
              market: instrument.market,
              symbol: instrument.symbol,
              name: instrument.name,
              addedAt: new Date().toISOString(),
            },
          ]
    )
  }

  remove(key: InstrumentKey): Promise<WatchItem[]> {
    return this.file.update((items) => items.filter((each) => each.key !== key))
  }
}
