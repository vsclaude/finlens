import { useState } from "react"

import type { InstrumentKey } from "@shared/api"
import { Change } from "@/components/change"
import { Gauge } from "@/components/charts/gauge"
import { Heatmap } from "@/components/charts/heatmap"
import { Sparkline } from "@/components/charts/sparkline"
import { Empty, Page, Panel } from "@/components/page"
import { Segmented } from "@/components/segmented"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCompact, formatMoney } from "@/lib/format"
import { NOT_ON_BINANCE, usePolling, useQuotes } from "@/lib/market"
import { useNav } from "@/lib/nav"

/** Indices and macro prices worth a glance, across both markets. */
const MACRO: { key: InstrumentKey; label: string }[] = [
  { key: "vn:VNINDEX", label: "VN-Index" },
  { key: "vn:VN30", label: "VN30" },
  { key: "vn:HNX", label: "HNX" },
  { key: "us:^GSPC", label: "S&P 500" },
  { key: "us:^IXIC", label: "Nasdaq" },
  { key: "us:^DJI", label: "Dow Jones" },
  { key: "us:GC=F", label: "Vàng" },
  { key: "us:USDVND=X", label: "USD/VND" },
]

export function MarketPage() {
  const [span, setSpan] = useState<"24h" | "7d">("24h")
  const coins = usePolling(
    () => window.desktop.getCoinMarkets(),
    "coins",
    120_000
  )
  const fear = usePolling(
    () => window.desktop.getFearGreed(),
    "fear-greed",
    30 * 60_000
  )
  const macro = useQuotes(MACRO.map((each) => each.key))
  const openChart = useNav((state) => state.openChart)
  const list = coins.data ?? []

  return (
    <Page
      title="Thị trường"
      subtitle="Chỉ số, vĩ mô và 60 đồng crypto vốn hoá lớn nhất"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
        {MACRO.map((each) => {
          const quote = macro.byKey.get(each.key)
          return (
            <button
              key={each.key}
              type="button"
              onClick={() => openChart(each.key)}
              className="flex flex-col gap-0.5 rounded-lg bg-card px-3 py-2 text-left ring-1 ring-foreground/8 hover:bg-accent/40"
            >
              <span className="text-xs text-muted-foreground">
                {each.label}
              </span>
              <span className="tabular text-sm font-semibold">
                {quote ? formatMoney(quote.price, quote.currency) : "—"}
              </span>
              <Change value={quote?.changePct} className="text-xs" />
            </button>
          )
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Panel
          title="Heatmap crypto"
          actions={
            <Segmented
              value={span}
              onChange={setSpan}
              options={[
                { value: "24h", label: "24 giờ" },
                { value: "7d", label: "7 ngày" },
              ]}
            />
          }
          bodyClassName="p-2"
        >
          {list.length ? (
            <Heatmap
              className="h-[420px] w-full"
              cells={list.slice(0, 50).map((coin) => ({
                id: coin.id,
                label: coin.symbol,
                size: coin.marketCap,
                change: span === "24h" ? coin.change24h : coin.change7d,
                title: `${coin.name} · ${formatMoney(coin.price, "USD")} · vốn hoá ${formatCompact(coin.marketCap)}${coin.pair ? "" : ` · ${NOT_ON_BINANCE}`}`,
                disabled: !coin.pair,
              }))}
              onSelect={(cell) => {
                const pair = list.find((coin) => coin.id === cell.id)?.pair
                if (pair) openChart(`crypto:${pair}`)
              }}
            />
          ) : (
            <Empty>{coins.error ?? "Đang tải…"}</Empty>
          )}
        </Panel>

        <Panel title="Fear & Greed">
          {fear.data ? (
            <div className="flex flex-col items-center gap-4">
              <Gauge
                value={fear.data.value}
                label={fear.data.label}
                size={190}
              />
              <div className="w-full">
                <div className="mb-1 text-xs text-muted-foreground">
                  30 ngày
                </div>
                <FearHistory
                  values={fear.data.history.map((each) => each.value)}
                />
              </div>
            </div>
          ) : (
            <Empty>{fear.error ?? "Đang tải…"}</Empty>
          )}
        </Panel>
      </div>

      <Panel title="Bảng xếp hạng" bodyClassName="p-0 pb-2">
        {list.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-4">#</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead className="text-right">Giá</TableHead>
                <TableHead className="text-right">24h</TableHead>
                <TableHead className="text-right">7 ngày</TableHead>
                <TableHead className="text-right">Vốn hoá</TableHead>
                <TableHead className="text-right">KL 24h</TableHead>
                <TableHead className="w-32 pr-4 text-right">
                  7 ngày qua
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((coin) => (
                <TableRow
                  key={coin.id}
                  title={coin.pair ? undefined : NOT_ON_BINANCE}
                  className={coin.pair ? "cursor-pointer" : "opacity-60"}
                  onClick={() => coin.pair && openChart(`crypto:${coin.pair}`)}
                >
                  <TableCell className="tabular pl-4 text-muted-foreground">
                    {coin.rank}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <img
                        src={coin.image}
                        alt=""
                        className="size-5 rounded-full"
                      />
                      <span className="font-medium">{coin.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {coin.symbol}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {formatMoney(coin.price, "USD")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Change value={coin.change24h} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Change value={coin.change7d} />
                  </TableCell>
                  <TableCell className="tabular text-right">
                    ${formatCompact(coin.marketCap)}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    ${formatCompact(coin.volume)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <Sparkline
                      values={coin.sparkline}
                      fill={false}
                      className="ml-auto h-7 w-28"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>{coins.error ?? "Đang tải…"}</Empty>
        )}
      </Panel>
    </Page>
  )
}

/** Thirty bars, each coloured where it falls between fear and greed. */
function FearHistory({ values }: { values: number[] }) {
  return (
    <div className="flex h-16 items-end gap-[2px]">
      {values.map((value, i) => (
        <div
          key={i}
          title={String(value)}
          className="flex-1 rounded-t-[2px]"
          style={{
            height: `${Math.max(4, value)}%`,
            background:
              value >= 50
                ? `color-mix(in oklab, var(--up) ${30 + (value - 50) * 1.4}%, var(--muted))`
                : `color-mix(in oklab, var(--down) ${30 + (50 - value) * 1.4}%, var(--muted))`,
          }}
        />
      ))}
    </div>
  )
}
