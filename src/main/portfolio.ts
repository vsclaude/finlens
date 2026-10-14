import { randomUUID } from "node:crypto"
import path from "node:path"

import type { NewTransaction, Transaction } from "../shared/api"
import { toKey } from "../shared/market"
import { computeHoldings } from "../shared/portfolio"
import { JsonFile } from "./json-file"

/**
 * `portfolio.json`: the ledger of trades. Holdings are never stored — they are
 * derived from the ledger every time (`shared/portfolio.ts`), so a corrected
 * trade can never leave a stale position behind.
 */
export class Portfolio {
  private readonly file: JsonFile<Transaction[]>

  constructor(dir: string) {
    this.file = new JsonFile(path.join(dir, "portfolio.json"), () => [])
  }

  list(): Promise<Transaction[]> {
    return this.file.read()
  }

  /**
   * Validated against the whole ledger, not just its own fields: a sell is
   * only refused once it is placed among the trades around it by date.
   */
  async add(
    input: NewTransaction
  ): Promise<{ transaction: Transaction; all: Transaction[] }> {
    const symbol = input.symbol.trim().toUpperCase()
    if (!symbol) throw new Error("Thiếu mã")
    if (!(input.quantity > 0)) throw new Error("Khối lượng phải lớn hơn 0")
    if (!(input.price >= 0)) throw new Error("Giá không hợp lệ")
    if (!(input.fee >= 0)) throw new Error("Phí không hợp lệ")
    if (Number.isNaN(Date.parse(input.date)))
      throw new Error("Ngày không hợp lệ")

    const transaction: Transaction = {
      id: randomUUID(),
      key: toKey(input.market, symbol),
      market: input.market,
      symbol,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee,
      date: input.date,
      note: input.note.trim(),
    }
    const all = await this.file.update((ledger) => {
      const next = [...ledger, transaction]
      // Throws on an oversell, which leaves the file as it was.
      computeHoldings(next)
      return next
    })
    return { transaction, all }
  }

  /**
   * Removing a buy can strand a later sell; that is refused for the same
   * reason an oversell is.
   */
  remove(id: string): Promise<Transaction[]> {
    return this.file.update((ledger) => {
      const next = ledger.filter((each) => each.id !== id)
      computeHoldings(next)
      return next
    })
  }
}
