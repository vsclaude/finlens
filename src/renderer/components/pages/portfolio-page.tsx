import { useMemo, useState } from "react"
import { PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"

import type { Transaction } from "@shared/api"
import { MARKET_LABEL } from "@shared/market"
import { sortLedger, type Valuation } from "@shared/portfolio"
import { Change, toneClass } from "@/components/change"
import { Donut, sliceColor } from "@/components/charts/donut"
import { Empty, Page, Panel, Stat } from "@/components/page"
import { Segmented } from "@/components/segmented"
import { TransactionDialog } from "@/components/transaction-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  formatCompact,
  formatMoney,
  formatPct,
  formatQuantity,
} from "@/lib/format"
import { useNav } from "@/lib/nav"
import { usePortfolio, useValuation } from "@/lib/portfolio"
import { useSettings } from "@/lib/settings"
import { cn, errorMessage } from "@/lib/utils"

export function PortfolioPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Kept through the closing animation, so the dialog does not flip from
  // "Sửa" to "Thêm" while it fades out.
  const [editing, setEditing] = useState<Transaction | null>(null)
  // A fresh dialog per opening: reopening a trade after a cancelled edit
  // shows the trade, not the abandoned changes.
  const [opening, setOpening] = useState(0)

  function openDialog(trade: Transaction | null) {
    setError(null)
    setEditing(trade)
    setOpening((n) => n + 1)
    setDialogOpen(true)
  }
  const [error, setError] = useState<string | null>(null)
  const transactions = usePortfolio((state) => state.transactions)
  const base = useSettings((state) => state.baseCurrency)
  const setSetting = useSettings((state) => state.set)
  const ask = useNav((state) => state.ask)
  const openChart = useNav((state) => state.openChart)
  const { valuation, usdVnd } = useValuation()
  const ledger = useMemo(
    () => sortLedger(transactions).reverse(),
    [transactions]
  )
  const unrealizedPct = valuation.totalCost
    ? (valuation.unrealizedPnl / valuation.totalCost) * 100
    : null

  return (
    <Page
      title="Danh mục"
      subtitle={
        usdVnd
          ? `Quy đổi theo tỷ giá USD/VND ${formatMoney(usdVnd, "VND")}`
          : "Giá thị trường cập nhật mỗi 15 giây"
      }
      actions={
        <>
          <Segmented
            value={base}
            onChange={(next) => void setSetting("baseCurrency", next)}
            options={[
              { value: "USD", label: "USD" },
              { value: "VND", label: "VND" },
            ]}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={transactions.length === 0}
            onClick={() =>
              void ask(
                "Đánh giá danh mục đầu tư của tôi: phân bổ theo thị trường và theo mã, mức độ tập trung, lãi/lỗ đã và chưa chốt, các vị thế rủi ro nhất (dựa trên phân tích kỹ thuật hiện tại), và đề xuất tái cơ cấu cụ thể kèm lý do."
              )
            }
          >
            <SparklesIcon />
            AI đánh giá
          </Button>
          <Button size="sm" onClick={() => openDialog(null)}>
            <PlusIcon />
            Thêm giao dịch
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tile>
          <Stat
            label="Tổng giá trị"
            value={formatMoney(valuation.totalValue, base)}
          />
        </Tile>
        <Tile>
          <Stat
            label="Vốn đang nắm giữ"
            value={formatMoney(valuation.totalCost, base)}
          />
        </Tile>
        <Tile>
          <Stat
            label="Lãi/lỗ chưa chốt"
            value={
              <span className={toneClass(valuation.unrealizedPnl)}>
                {formatMoney(valuation.unrealizedPnl, base)}
              </span>
            }
            detail={<Change value={unrealizedPct} />}
          />
        </Tile>
        <Tile>
          <Stat
            label="Lãi/lỗ đã chốt"
            value={
              <span className={toneClass(valuation.realizedPnl)}>
                {formatMoney(valuation.realizedPnl, base)}
              </span>
            }
          />
        </Tile>
      </div>

      {valuation.unpriced.length > 0 && (
        <p className="text-xs text-warning">
          Chưa có giá cho {valuation.unpriced.join(", ")} — không tính vào tổng.
        </p>
      )}

      {transactions.length === 0 ? (
        <Panel>
          <Empty>
            Chưa có giao dịch nào. Thêm giao dịch mua đầu tiên để theo dõi
            lãi/lỗ và phân bổ danh mục.
          </Empty>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <AllocationPanel valuation={valuation} />
            <Panel title="Vị thế đang mở" bodyClassName="p-0 pb-2">
              {valuation.open.length === 0 ? (
                <Empty>Không còn vị thế nào mở.</Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Mã</TableHead>
                      <TableHead className="text-right">KL</TableHead>
                      <TableHead className="text-right">Giá vốn TB</TableHead>
                      <TableHead className="text-right">Giá TT</TableHead>
                      <TableHead className="text-right">Giá trị</TableHead>
                      <TableHead className="text-right">Lãi/lỗ</TableHead>
                      <TableHead className="pr-4 text-right">
                        Tỷ trọng
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valuation.open.map((position) => (
                      <TableRow
                        key={position.key}
                        className="cursor-pointer"
                        onClick={() => openChart(position.key)}
                      >
                        <TableCell className="pl-4">
                          <div className="font-medium">{position.symbol}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {MARKET_LABEL[position.market]}
                          </div>
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatQuantity(position.quantity)}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatMoney(position.avgCost, position.currency)}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatMoney(position.price, position.currency)}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {formatMoney(position.valueBase, base)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className={cn(
                              "tabular",
                              toneClass(position.unrealizedPnl)
                            )}
                          >
                            {formatMoney(
                              position.unrealizedPnl,
                              position.currency
                            )}
                          </div>
                          <Change
                            value={position.unrealizedPct}
                            className="text-[11px]"
                          />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${position.weight * 100}%` }}
                              />
                            </div>
                            <span className="tabular w-12 text-xs">
                              {formatPct(position.weight * 100, 1).replace(
                                "+",
                                ""
                              )}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </div>

          <Panel title="Lịch sử giao dịch" bodyClassName="p-0 pb-2">
            {error && (
              <p className="px-4 pb-2 text-xs text-destructive">{error}</p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Ngày</TableHead>
                  <TableHead>Lệnh</TableHead>
                  <TableHead>Mã</TableHead>
                  <TableHead className="text-right">KL</TableHead>
                  <TableHead className="text-right">Giá</TableHead>
                  <TableHead className="text-right">Phí</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="w-16 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((trade) => {
                  const currency = trade.market === "vn" ? "VND" : "USD"
                  return (
                    <TableRow
                      key={trade.id}
                      className="group cursor-pointer"
                      onDoubleClick={() => openDialog(trade)}
                    >
                      <TableCell className="tabular pl-4">
                        {trade.date.slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            trade.side === "buy" ? "text-up" : "text-down"
                          }
                        >
                          {trade.side === "buy" ? "Mua" : "Bán"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {trade.symbol}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatQuantity(trade.quantity)}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {formatMoney(trade.price, currency)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {trade.fee ? formatMoney(trade.fee, currency) : "—"}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {currency === "VND"
                          ? `${formatCompact(trade.quantity * trade.price)} ₫`
                          : formatMoney(trade.quantity * trade.price, currency)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {trade.note}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Sửa giao dịch"
                            title="Sửa"
                            onClick={() => openDialog(trade)}
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Xoá giao dịch"
                            title="Xoá"
                            onClick={() => {
                              setError(null)
                              window.desktop
                                .removeTransaction(trade.id)
                                .catch((caught: unknown) =>
                                  setError(errorMessage(caught))
                                )
                            }}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}

      <TransactionDialog
        key={opening}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </Page>
  )
}

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/8">
      {children}
    </div>
  )
}

/** By position, the top seven and the rest as one slice; and by market. */
function AllocationPanel({ valuation }: { valuation: Valuation }) {
  const priced = valuation.open.filter((each) => each.valueBase != null)
  const top = priced.slice(0, 7)
  const rest = priced
    .slice(7)
    .reduce((sum, each) => sum + (each.valueBase ?? 0), 0)
  const slices = [
    ...top.map((each, i) => ({
      label: each.symbol,
      value: each.valueBase ?? 0,
      color: sliceColor(i),
    })),
    ...(rest > 0
      ? [{ label: "Khác", value: rest, color: "var(--muted-foreground)" }]
      : []),
  ]
  const byMarket = (["crypto", "vn", "us"] as const)
    .map((market) => ({
      market,
      value: priced
        .filter((each) => each.market === market)
        .reduce((sum, each) => sum + (each.valueBase ?? 0), 0),
    }))
    .filter((each) => each.value > 0)

  return (
    <Panel title="Phân bổ">
      {slices.length === 0 ? (
        <Empty>Đang tải giá…</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Donut
              slices={slices}
              center={
                <>
                  <span className="text-xs text-muted-foreground">
                    {priced.length} mã
                  </span>
                  <span className="tabular text-sm font-semibold">
                    {formatMoney(valuation.totalValue, valuation.base)}
                  </span>
                </>
              }
            />
            <ul className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              {slices.map((slice) => (
                <li key={slice.label} className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: slice.color }}
                  />
                  <span className="flex-1 truncate">{slice.label}</span>
                  <span className="tabular text-muted-foreground">
                    {((slice.value / valuation.totalValue) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              Theo thị trường
            </span>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {byMarket.map((each, i) => (
                <div
                  key={each.market}
                  style={{
                    width: `${(each.value / valuation.totalValue) * 100}%`,
                    background: sliceColor(i + 2),
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {byMarket.map((each, i) => (
                <span key={each.market} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ background: sliceColor(i + 2) }}
                  />
                  {MARKET_LABEL[each.market]}
                  <span className="tabular text-muted-foreground">
                    {((each.value / valuation.totalValue) * 100).toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
