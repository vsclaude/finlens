import { useState } from "react"
import { PlusIcon, SparklesIcon, XIcon } from "lucide-react"

import type { CoinMarket, InstrumentKey, Quote, WatchItem } from "@shared/api"
import { currencyOf, MARKET_LABEL } from "@shared/market"
import { AddInstrumentDialog } from "@/components/add-instrument-dialog"
import { Change, toneClass } from "@/components/change"
import { Gauge } from "@/components/charts/gauge"
import { Sparkline } from "@/components/charts/sparkline"
import { Empty, Page, Panel, Stat } from "@/components/page"
import { Button } from "@/components/ui/button"
import { formatMoney, formatPct } from "@/lib/format"
import { NOT_ON_BINANCE, useCandles, usePolling, useQuotes } from "@/lib/market"
import { useNav } from "@/lib/nav"
import { useValuation } from "@/lib/portfolio"
import { cn } from "@/lib/utils"
import { useWatchlist } from "@/lib/watchlist"

/** The tiles across the top, beside the portfolio's. */
const HEADLINE: { key: InstrumentKey; label: string }[] = [
  { key: "vn:VNINDEX", label: "VN-Index" },
  { key: "us:^GSPC", label: "S&P 500" },
  { key: "crypto:BTCUSDT", label: "Bitcoin" },
]

/** One click from the dashboard to an answer — the questions people ask the
 * analyst most, phrased so it reaches for the right tools. */
const QUICK_PROMPTS = [
  {
    label: "Tổng quan thị trường hôm nay",
    prompt:
      "Tổng quan thị trường hôm nay: VN-Index, S&P 500, Bitcoin và tâm lý thị trường crypto. Điểm nhấn là gì và nên chú ý điều gì trong tuần này?",
  },
  {
    label: "Đánh giá danh mục của tôi",
    prompt:
      "Đánh giá danh mục đầu tư của tôi: phân bổ, mức độ tập trung, lãi/lỗ, vị thế rủi ro nhất và đề xuất tái cơ cấu cụ thể.",
  },
  {
    label: "Cơ hội trong watchlist",
    prompt:
      "Quét các mã trong watchlist của tôi bằng phân tích kỹ thuật khung ngày. Mã nào đang có thiết lập đẹp nhất và mã nào nên tránh? Lập bảng so sánh.",
  },
  {
    label: "Phân tích kỹ thuật VN-Index",
    prompt:
      "Phân tích kỹ thuật VN-Index (vn:VNINDEX) trên khung ngày và tuần: xu hướng, hỗ trợ/kháng cự, kịch bản cho các phiên tới.",
  },
]

export function DashboardPage() {
  const items = useWatchlist((state) => state.items)
  const [adding, setAdding] = useState(false)
  const quotes = useQuotes([
    ...HEADLINE.map((each) => each.key),
    ...items.map((each) => each.key),
  ])
  const today = new Date().toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <Page title="Tổng quan" subtitle={today}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <PortfolioTile />
        {HEADLINE.map((each) => (
          <QuoteTile
            key={each.key}
            label={each.label}
            quote={quotes.byKey.get(each.key)}
          />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel
          title="Watchlist"
          actions={
            <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
              <PlusIcon />
              Thêm mã
            </Button>
          }
        >
          {items.length === 0 ? (
            <Empty>Watchlist trống — thêm một mã để theo dõi.</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {items.map((item) => (
                <WatchCard
                  key={item.key}
                  item={item}
                  quote={quotes.byKey.get(item.key)}
                />
              ))}
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          <FearGreedPanel />
          <QuickAsk />
        </div>
      </div>

      <MoversPanel />
      <AddInstrumentDialog open={adding} onOpenChange={setAdding} />
    </Page>
  )
}

function PortfolioTile() {
  const { valuation } = useValuation()
  const go = useNav((state) => state.go)
  const pct = valuation.totalCost
    ? (valuation.unrealizedPnl / valuation.totalCost) * 100
    : null
  return (
    <button
      type="button"
      onClick={() => go("portfolio")}
      className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/8 transition-colors hover:bg-accent/40"
    >
      <Stat
        label="Danh mục"
        value={formatMoney(valuation.totalValue, valuation.base)}
        detail={
          valuation.open.length ? (
            <span className={toneClass(valuation.unrealizedPnl)}>
              {formatMoney(valuation.unrealizedPnl, valuation.base)} (
              {formatPct(pct)})
            </span>
          ) : (
            <span className="text-muted-foreground">Chưa có giao dịch</span>
          )
        }
      />
    </button>
  )
}

function QuoteTile({
  label,
  quote,
}: {
  label: string
  quote: Quote | undefined
}) {
  const openChart = useNav((state) => state.openChart)
  return (
    <button
      type="button"
      disabled={!quote}
      onClick={() => quote && openChart(quote.key)}
      className="rounded-xl bg-card p-4 text-left ring-1 ring-foreground/8 transition-colors hover:bg-accent/40"
    >
      <Stat
        label={label}
        value={quote ? formatMoney(quote.price, quote.currency) : "—"}
        detail={
          quote ? (
            <Change value={quote.changePct} icon />
          ) : (
            <span className="text-muted-foreground">Đang tải…</span>
          )
        }
      />
    </button>
  )
}

function WatchCard({
  item,
  quote,
}: {
  item: WatchItem
  quote: Quote | undefined
}) {
  const openChart = useNav((state) => state.openChart)
  // A month of daily closes: enough shape to read, and the same request the
  // chart page makes, so opening the chart is answered from main's cache.
  const candles = useCandles(item.key, "1d", 5 * 60_000)
  const closes = (candles.data ?? []).slice(-30).map((bar) => bar.close)
  const currency = quote?.currency ?? currencyOf(item.market, item.symbol)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openChart(item.key)}
      onKeyDown={(event) => event.key === "Enter" && openChart(item.key)}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-lg bg-muted/40 p-3 ring-1 ring-foreground/5 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{item.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {item.symbol} · {MARKET_LABEL[item.market]}
          </div>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Bỏ khỏi watchlist"
          className="opacity-0 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            void window.desktop.removeWatch(item.key)
          }}
        >
          <XIcon />
        </Button>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col">
          <span className="tabular text-base font-semibold">
            {quote ? formatMoney(quote.price, currency) : "—"}
          </span>
          <Change value={quote?.changePct} className="text-xs" />
        </div>
        <Sparkline values={closes} className="h-9 w-24 shrink-0" />
      </div>
    </div>
  )
}

function FearGreedPanel() {
  const fear = usePolling(
    () => window.desktop.getFearGreed(),
    "fear-greed",
    30 * 60_000
  )
  const week = fear.data?.history.at(-8)?.value
  return (
    <Panel title="Crypto Fear & Greed">
      {fear.data ? (
        <Gauge
          value={fear.data.value}
          label={fear.data.label}
          caption={week != null ? `Tuần trước: ${week}` : undefined}
          size={170}
        />
      ) : (
        <Empty>{fear.error ?? "Đang tải…"}</Empty>
      )}
    </Panel>
  )
}

function QuickAsk() {
  const ask = useNav((state) => state.ask)
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <SparklesIcon className="size-4 text-primary" />
          Hỏi AI Analyst
        </span>
      }
    >
      <div className="flex flex-col gap-1.5">
        {QUICK_PROMPTS.map((each) => (
          <Button
            key={each.label}
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => void ask(each.prompt)}
          >
            {each.label}
          </Button>
        ))}
      </div>
    </Panel>
  )
}

function MoversPanel() {
  const coins = usePolling(
    () => window.desktop.getCoinMarkets(),
    "coins",
    120_000
  )
  // Stablecoins sit at ±0.01% and would fill the middle of both lists.
  const moving = (coins.data ?? []).filter(
    (coin) => Math.abs(coin.change24h) > 0.3
  )
  const sorted = [...moving].sort((a, b) => b.change24h - a.change24h)
  const gainers = sorted.slice(0, 5)
  const losers = sorted.slice(-5).reverse()

  return (
    <Panel title="Crypto biến động mạnh nhất 24h (top 60 vốn hoá)">
      {coins.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MoverList title="Tăng mạnh" coins={gainers} />
          <MoverList title="Giảm mạnh" coins={losers} />
        </div>
      ) : (
        <Empty>{coins.error ?? "Đang tải…"}</Empty>
      )}
    </Panel>
  )
}

function MoverList({ title, coins }: { title: string; coins: CoinMarket[] }) {
  const openChart = useNav((state) => state.openChart)
  return (
    <div className="flex flex-col">
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      {coins.map((coin) => (
        <button
          key={coin.id}
          type="button"
          disabled={!coin.pair}
          title={coin.pair ? undefined : NOT_ON_BINANCE}
          onClick={() => coin.pair && openChart(`crypto:${coin.pair}`)}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm hover:bg-accent/50",
            !coin.pair && "opacity-60 hover:bg-transparent"
          )}
        >
          <img src={coin.image} alt="" className="size-5 rounded-full" />
          <span className="w-14 font-medium">{coin.symbol}</span>
          <span className="flex-1 truncate text-xs text-muted-foreground">
            {coin.name}
          </span>
          <span className="tabular w-24 text-right">
            {formatMoney(coin.price, "USD")}
          </span>
          <Change value={coin.change24h} pill className="w-20 justify-end" />
        </button>
      ))}
    </div>
  )
}
