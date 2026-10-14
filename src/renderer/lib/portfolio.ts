import { useMemo } from "react"
import { create } from "zustand"

import type { Transaction } from "@shared/api"
import { USD_VND_KEY } from "@shared/market"
import {
  computeHoldings,
  valuePortfolio,
  type Valuation,
} from "@shared/portfolio"
import { useQuotes } from "@/lib/market"
import { useSettings } from "@/lib/settings"

type PortfolioState = {
  transactions: Transaction[]
  load: () => Promise<void>
  /** Follows `transactionsChanged`. Returns the unsubscribe. */
  listen: () => () => void
}

/** The ledger as main last said it was — see `useWatchlist` for why. */
export const usePortfolio = create<PortfolioState>((set) => ({
  transactions: [],
  async load() {
    set({ transactions: await window.desktop.listTransactions() })
  },
  listen() {
    return window.desktop.onTransactionsChanged((transactions) =>
      set({ transactions })
    )
  },
}))

/**
 * The portfolio marked to live prices, in the base currency — what both the
 * dashboard's tile and the portfolio page draw. The ledger is validated in
 * main on every write, so `computeHoldings` throwing here would mean a file
 * edited by hand; it reads as an empty portfolio rather than a blank page.
 */
export function useValuation(): {
  valuation: Valuation
  loading: boolean
  usdVnd: number | null
} {
  const transactions = usePortfolio((state) => state.transactions)
  const base = useSettings((state) => state.baseCurrency)
  const holdings = useMemo(() => {
    try {
      return computeHoldings(transactions)
    } catch {
      return []
    }
  }, [transactions])
  const keys = holdings
    .filter((each) => each.quantity > 0)
    .map((each) => each.key)
  const quotes = useQuotes([...keys, USD_VND_KEY])
  const usdVnd = quotes.byKey.get(USD_VND_KEY)?.price ?? null
  const prices = new Map(
    [...quotes.byKey].map(([key, quote]) => [key, quote.price])
  )
  return {
    valuation: valuePortfolio(holdings, prices, base, usdVnd),
    loading: quotes.loading,
    usdVnd,
  }
}
