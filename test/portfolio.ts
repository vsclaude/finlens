/**
 * The portfolio, both halves: main's `Portfolio` against a real temporary
 * directory, and the shared average-cost arithmetic it validates with.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import type { NewTransaction, Transaction } from "../src/shared/api"
import { Portfolio } from "../src/main/portfolio"
import {
  computeHoldings,
  toBase,
  valuePortfolio,
} from "../src/shared/portfolio"
import { check, finish, section } from "./harness"

const near = (a: number | null | undefined, b: number, eps = 1e-6) =>
  a != null && Math.abs(a - b) < eps

let n = 0
const trade = (patch: Partial<Transaction>): Transaction => ({
  id: String((n += 1)),
  key: "crypto:BTCUSDT",
  market: "crypto",
  symbol: "BTCUSDT",
  side: "buy",
  quantity: 1,
  price: 100,
  fee: 0,
  date: "2026-01-01",
  note: "",
  ...patch,
})

section("computeHoldings — average cost")
const [btc] = computeHoldings([
  trade({ quantity: 1, price: 100, fee: 2 }),
  trade({ quantity: 1, price: 200, date: "2026-01-02" }),
  trade({ side: "sell", quantity: 1, price: 250, fee: 1, date: "2026-01-03" }),
])
check("holds what is left", near(btc?.quantity, 1), btc)
check("average includes the buy fee", near(btc?.avgCost, 151), btc?.avgCost)
check("a sell does not move the average", near(btc?.costBasis, 151))
check(
  "realises against the average, less its fee",
  near(btc?.realizedPnl, 98),
  btc?.realizedPnl
)
check("counts every fee", near(btc?.fees, 3))

const closed = computeHoldings([
  trade({ quantity: 2, price: 10 }),
  trade({ side: "sell", quantity: 2, price: 15, date: "2026-01-05" }),
])[0]!
check(
  "selling everything closes the position",
  closed.quantity === 0 && closed.avgCost === 0
)
check("and keeps the realised gain", near(closed.realizedPnl, 10))

const unordered = computeHoldings([
  trade({ side: "sell", quantity: 1, price: 150, date: "2026-03-01" }),
  trade({ quantity: 1, price: 100, date: "2026-01-01" }),
])[0]!
check(
  "the ledger is read by date, not entry order",
  near(unordered.realizedPnl, 50)
)

let threw = ""
try {
  computeHoldings([
    trade({ quantity: 1 }),
    trade({ side: "sell", quantity: 2, date: "2026-02-01" }),
  ])
} catch (error) {
  threw = String(error)
}
check("an oversell throws", threw.includes("BTCUSDT"), threw)

section("valuePortfolio")
const holdings = computeHoldings([
  trade({ quantity: 1, price: 100 }),
  trade({
    key: "vn:FPT",
    market: "vn",
    symbol: "FPT",
    quantity: 100,
    price: 50_000,
  }),
])
const prices = new Map([
  ["crypto:BTCUSDT", 150],
  ["vn:FPT", 60_000],
])
const usd = valuePortfolio(holdings, prices, "USD", 25_000)
check("sums across currencies", near(usd.totalValue, 150 + 240), usd.totalValue)
check("cost converts too", near(usd.totalCost, 100 + 200), usd.totalCost)
check("unrealised is value less cost", near(usd.unrealizedPnl, 90))
check(
  "weights sum to one",
  near(
    usd.open.reduce((sum, p) => sum + p.weight, 0),
    1
  )
)
check("largest first", usd.open[0]?.symbol === "FPT")
const noRate = valuePortfolio(holdings, prices, "USD", null)
check(
  "a missing rate leaves the position out",
  noRate.unpriced.includes("FPT") && near(noRate.totalValue, 150)
)
check(
  "toBase both ways",
  toBase(1, "USD", "VND", 25_000) === 25_000 &&
    toBase(25_000, "VND", "USD", 25_000) === 1
)

section("Portfolio — storage")
const dir = mkdtempSync(path.join(tmpdir(), "finlens-portfolio-"))
try {
  const portfolio = new Portfolio(dir)
  const input: NewTransaction = {
    market: "vn",
    symbol: " hpg ",
    side: "buy",
    quantity: 1000,
    price: 27_000,
    fee: 40_500,
    date: "2026-03-01",
    note: " lần đầu ",
  }
  const { transaction } = await portfolio.add(input)
  check(
    "cleans symbol and note",
    transaction.symbol === "HPG" && transaction.note === "lần đầu",
    transaction
  )
  check("keys it", transaction.key === "vn:HPG")

  let refused = false
  try {
    await portfolio.add({
      ...input,
      side: "sell",
      quantity: 2000,
      date: "2026-04-01",
    })
  } catch {
    refused = true
  }
  check("refuses an oversell", refused)
  check(
    "and leaves the ledger as it was",
    (await new Portfolio(dir).list()).length === 1
  )

  for (const bad of [
    { quantity: 0 },
    { price: -1 },
    { date: "nope" },
    { symbol: " " },
  ]) {
    let rejected = false
    try {
      await portfolio.add({ ...input, ...bad })
    } catch {
      rejected = true
    }
    check(`rejects ${JSON.stringify(bad)}`, rejected)
  }

  await portfolio.add({
    ...input,
    side: "sell",
    quantity: 500,
    date: "2026-04-01",
  })
  let stranded = false
  try {
    await portfolio.remove(transaction.id)
  } catch {
    stranded = true
  }
  check("removing a buy a later sell needs is refused", stranded)
  check("persists to disk", (await new Portfolio(dir).list()).length === 2)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

finish()
