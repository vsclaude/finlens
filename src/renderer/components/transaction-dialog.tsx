import { useState, type FormEvent } from "react"

import type { Market, Side } from "@shared/api"
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
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage } from "@/lib/utils"

const PRICE_HINT: Record<Market, string> = {
  crypto: "USD / đơn vị",
  vn: "VND / cổ phiếu, ví dụ 57100",
  us: "USD / cổ phiếu",
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Records a trade. The symbol is checked against its provider so the ledger
 * only ever holds keys the app can price; an oversell is refused by main,
 * whose message is shown as is.
 */
export function TransactionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [market, setMarket] = useState<Market>("vn")
  const [side, setSide] = useState<Side>("buy")
  const [symbol, setSymbol] = useState("")
  const [quantity, setQuantity] = useState("")
  const [price, setPrice] = useState("")
  const [fee, setFee] = useState("")
  const [date, setDate] = useState(today)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fillPrice() {
    if (!symbol.trim()) return
    setError(null)
    const instrument = await window.desktop.resolveInstrument(market, symbol)
    if (!instrument) {
      setError(`Không tìm thấy mã “${symbol.trim()}”.`)
      return
    }
    const [quote] = await window.desktop.getQuotes([instrument.key])
    if (quote) setPrice(String(quote.price))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const instrument = await window.desktop.resolveInstrument(market, symbol)
      if (!instrument) {
        setError(
          `Không tìm thấy mã “${symbol.trim()}” trên ${MARKET_LABEL[market]}.`
        )
        return
      }
      await window.desktop.addTransaction({
        market,
        symbol: instrument.symbol,
        side,
        quantity: Number(quantity),
        price: Number(price),
        fee: Number(fee || 0),
        date,
        note,
      })
      setSymbol("")
      setQuantity("")
      setPrice("")
      setFee("")
      setNote("")
      onOpenChange(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm giao dịch</DialogTitle>
          <DialogDescription>
            Giá và phí tính bằng đơn vị tiền của mã: VND cho cổ phiếu Việt Nam,
            USD cho phần còn lại.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Segmented
              value={market}
              onChange={setMarket}
              options={MARKETS.map((each) => ({
                value: each,
                label: MARKET_LABEL[each],
              }))}
            />
            <Segmented
              value={side}
              onChange={setSide}
              options={[
                { value: "buy", label: "Mua" },
                { value: "sell", label: "Bán" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mã">
              <Input
                autoFocus
                required
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder={
                  market === "crypto" ? "BTC" : market === "vn" ? "FPT" : "AAPL"
                }
              />
            </Field>
            <Field label="Ngày">
              <Input
                type="date"
                required
                value={date}
                max={today()}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Khối lượng">
              <Input
                type="number"
                required
                min="0"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field
              label={
                <span className="flex w-full items-center justify-between">
                  Giá
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline"
                    onClick={() => void fillPrice()}
                  >
                    Giá hiện tại
                  </button>
                </span>
              }
            >
              <Input
                type="number"
                required
                min="0"
                step="any"
                value={price}
                placeholder={PRICE_HINT[market]}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
            <Field label="Phí">
              <Input
                type="number"
                min="0"
                step="any"
                value={fee}
                placeholder="0"
                onChange={(event) => setFee(event.target.value)}
              />
            </Field>
            <Field label="Ghi chú">
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy && <Spinner />}
            Lưu giao dịch
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
