import { useState, type FormEvent } from "react"

import type { Market } from "@shared/api"
import { MARKET_LABEL, MARKETS } from "@shared/market"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const HINT: Record<Market, string> = {
  crypto: "BTC, ETH, SOL… (cặp USDT trên Binance)",
  vn: "FPT, VCB, HPG, VNINDEX, VN30…",
  us: "AAPL, NVDA, ^GSPC, GC=F (vàng)…",
}

/**
 * Adds an instrument to the watchlist, checked against its provider first —
 * a typo should fail here, not as a blank tile on the dashboard.
 */
export function AddInstrumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [market, setMarket] = useState<Market>("crypto")
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    try {
      const instrument = await window.desktop.resolveInstrument(market, input)
      if (!instrument) {
        setError(
          `Không tìm thấy “${input.trim()}” trên thị trường ${MARKET_LABEL[market]}.`
        )
        return
      }
      await window.desktop.addWatch(instrument)
      setInput("")
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm vào watchlist</DialogTitle>
          <DialogDescription>Chọn thị trường rồi nhập mã.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Segmented
            value={market}
            onChange={(next) => {
              setMarket(next)
              setError(null)
            }}
            options={MARKETS.map((each) => ({
              value: each,
              label: MARKET_LABEL[each],
            }))}
          />
          <Input
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={HINT[market]}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy && <Spinner />}
            Thêm
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
