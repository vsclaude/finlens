import { useMemo, useState } from "react"
import { PlusIcon, RefreshCwIcon, SparklesIcon } from "lucide-react"

import type { Interval, Quote } from "@shared/api"
import {
  performanceStats,
  technicalSummary,
  type TechnicalSummary,
} from "@shared/indicators"
import { currencyOf, MARKET_LABEL, parseKey } from "@shared/market"
import { toneClass } from "@/components/change"
import { Gauge } from "@/components/charts/gauge"
import { PriceChart, type Overlay } from "@/components/charts/price-chart"
import { Empty, Panel } from "@/components/page"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  formatCompact,
  formatMoney,
  formatPct,
  formatPrice,
} from "@/lib/format"
import { useCandles, useQuotes } from "@/lib/market"
import { DEFAULT_KEY, useNav } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { useWatchlist } from "@/lib/watchlist"

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
]

const OVERLAYS: { value: Overlay; label: string }[] = [
  { value: "ma", label: "MA" },
  { value: "bb", label: "Bollinger" },
  { value: "volume", label: "Volume" },
  { value: "rsi", label: "RSI" },
  { value: "macd", label: "MACD" },
]

const INTERVAL_WORD: Record<Interval, string> = {
  "1h": "1 giờ",
  "4h": "4 giờ",
  "1d": "ngày",
  "1w": "tuần",
}

export function ChartPage() {
  const key = useNav((state) => state.chartKey)
  const interval = useNav((state) => state.chartInterval)
  const openChart = useNav((state) => state.openChart)
  const ask = useNav((state) => state.ask)
  const items = useWatchlist((state) => state.items)
  const [overlays, setOverlays] = useState<Set<Overlay>>(
    () => new Set<Overlay>(["ma", "volume", "rsi"])
  )

  const parsed = parseKey(key)
  const candles = useCandles(key, interval)
  const quotes = useQuotes([key])
  const quote = quotes.byKey.get(key)
  const currency =
    quote?.currency ??
    (parsed ? currencyOf(parsed.market, parsed.symbol) : "USD")
  const watched = items.some((each) => each.key === key)
  const name =
    items.find((each) => each.key === key)?.name ??
    quote?.name ??
    parsed?.symbol ??
    key

  const summary = useMemo(
    () => (candles.data ? technicalSummary(candles.data) : null),
    [candles.data]
  )
  const stats = useMemo(
    () => (candles.data ? performanceStats(candles.data.slice(-150)) : null),
    [candles.data]
  )

  const pickerItems = [
    ...items.map((each) => ({
      value: each.key,
      label: `${each.name} · ${each.symbol}`,
    })),
    ...(watched ? [] : [{ value: key, label: name }]),
  ]

  function toggle(overlay: Overlay) {
    setOverlays((current) => {
      const next = new Set(current)
      if (next.has(overlay)) next.delete(overlay)
      else next.add(overlay)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={key}
          items={pickerItems}
          onValueChange={(value) => value && openChart(value as string)}
        >
          <SelectTrigger className="min-w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pickerItems.map((each) => (
              <SelectItem key={each.value} value={each.value}>
                {each.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Segmented
          value={interval}
          options={INTERVALS}
          onChange={(next) => openChart(key, next)}
        />
        <div className="flex items-center gap-1">
          {OVERLAYS.map((each) => (
            <Button
              key={each.value}
              size="xs"
              variant={overlays.has(each.value) ? "secondary" : "ghost"}
              onClick={() => toggle(each.value)}
              className={cn(
                !overlays.has(each.value) && "text-muted-foreground"
              )}
            >
              {each.label}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Tải lại"
          onClick={() => {
            candles.refresh()
            quotes.refresh()
          }}
        >
          <RefreshCwIcon />
        </Button>
        {/* Only once it has drawn: a key that fails here would be a tile
            that fails on the dashboard too. */}
        {!watched && parsed && candles.data?.length ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void window.desktop.addWatch({
                key,
                market: parsed.market,
                symbol: parsed.symbol,
                name,
              })
            }
          >
            <PlusIcon />
            Watchlist
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() =>
            void ask(
              `Phân tích kỹ thuật ${name} (${key}) trên khung ${INTERVAL_WORD[interval]}, đối chiếu thêm một khung lớn hơn. Nêu xu hướng, động lượng, hỗ trợ/kháng cự, các tin tức gần đây có ảnh hưởng, và kịch bản giao dịch với điểm vào, cắt lỗ, chốt lời.`
            )
          }
        >
          <SparklesIcon />
          Phân tích bằng AI
        </Button>
      </div>

      <QuoteHeader
        name={name}
        quote={quote}
        market={parsed?.market}
        symbol={parsed?.symbol}
        currency={currency}
      />

      <div className="flex min-h-0 flex-1 gap-3">
        <section className="relative min-h-[360px] min-w-0 flex-1 rounded-xl bg-card p-2 ring-1 ring-foreground/8">
          {candles.data?.length ? (
            <PriceChart
              candles={candles.data}
              interval={interval}
              currency={currency}
              overlays={overlays}
            />
          ) : candles.loading ? (
            <Empty>
              <Spinner />
            </Empty>
          ) : (
            <Empty>
              <div className="flex flex-col items-center gap-3">
                {candles.error ??
                  "Không có dữ liệu cho mã này ở khung thời gian này."}
                {key !== DEFAULT_KEY && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openChart(DEFAULT_KEY)}
                  >
                    Về biểu đồ Bitcoin
                  </Button>
                )}
              </div>
            </Empty>
          )}
        </section>
        <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
          <TechnicalPanel summary={summary} currency={currency} />
          {stats && (
            <Panel title={`150 nến gần nhất`}>
              <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Lợi nhuận</dt>
                <dd
                  className={cn(
                    "tabular text-right",
                    toneClass(stats.returnPct)
                  )}
                >
                  {formatPct(stats.returnPct)}
                </dd>
                <dt className="text-muted-foreground">Biến động / nến</dt>
                <dd className="tabular text-right">
                  {formatPct(stats.volatilityPct).replace("+", "")}
                </dd>
                <dt className="text-muted-foreground">Sụt giảm tối đa</dt>
                <dd className="tabular text-right text-down">
                  {formatPct(stats.maxDrawdownPct)}
                </dd>
              </dl>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

function QuoteHeader({
  name,
  quote,
  market,
  symbol,
  currency,
}: {
  name: string
  quote: Quote | undefined
  market: Quote["market"] | undefined
  symbol: string | undefined
  currency: string
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">
          {symbol} {market && `· ${MARKET_LABEL[market]}`}
        </span>
        <span className="text-lg leading-tight font-semibold">{name}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-2xl font-semibold tracking-tight">
          {quote ? formatMoney(quote.price, currency) : "—"}
        </span>
        {quote && (
          <span className={cn("tabular text-sm", toneClass(quote.change))}>
            {quote.change > 0 ? "+" : ""}
            {formatPrice(quote.change, currency)} ({formatPct(quote.changePct)})
          </span>
        )}
      </div>
      {quote && (
        <dl className="flex gap-4 text-xs">
          <div>
            <dt className="text-muted-foreground">Cao</dt>
            <dd className="tabular">{formatPrice(quote.high, currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Thấp</dt>
            <dd className="tabular">{formatPrice(quote.low, currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              {market === "crypto" ? "KL 24h ($)" : "Khối lượng"}
            </dt>
            <dd className="tabular">{formatCompact(quote.volume)}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}

/** The rule-based reading of the chart — what `get_technicals` hands the
 * analyst, drawn for the reader to check it against. */
function TechnicalPanel({
  summary,
  currency,
}: {
  summary: TechnicalSummary | null
  currency: string
}) {
  if (!summary) {
    return (
      <Panel title="Tín hiệu kỹ thuật">
        <Empty>Chưa đủ dữ liệu.</Empty>
      </Panel>
    )
  }
  const level = (label: string, value: number | null) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right">
        {value == null ? "—" : formatPrice(value, currency)}
      </dd>
    </>
  )
  return (
    <>
      <Panel title="Tín hiệu kỹ thuật">
        <div className="flex flex-col gap-3">
          <Gauge
            value={(summary.score + 1) * 50}
            label={summary.verdict}
            caption={`${summary.signals.length} tín hiệu`}
            size={150}
          />
          <ul className="flex flex-col gap-1">
            {summary.signals.map((signal) => (
              <li key={signal.label} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    signal.tone === "bullish" && "bg-up",
                    signal.tone === "bearish" && "bg-down",
                    signal.tone === "neutral" && "bg-muted-foreground"
                  )}
                />
                {signal.label}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
      <Panel title="Các mức quan trọng">
        <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
          {level("Kháng cự (20 nến)", summary.resistance)}
          {level("Hỗ trợ (20 nến)", summary.support)}
          {level("SMA20", summary.sma20)}
          {level("SMA50", summary.sma50)}
          {level("SMA200", summary.sma200)}
          <dt className="text-muted-foreground">RSI(14)</dt>
          <dd className="tabular text-right">
            {summary.rsi14?.toFixed(1) ?? "—"}
          </dd>
          <dt className="text-muted-foreground">ATR(14)</dt>
          <dd className="tabular text-right">
            {summary.atrPct == null ? "—" : `${summary.atrPct.toFixed(2)}%`}
          </dd>
          <dt className="text-muted-foreground">KL / TB20</dt>
          <dd className="tabular text-right">
            {summary.volumeRatio == null
              ? "—"
              : `${summary.volumeRatio.toFixed(2)}×`}
          </dd>
        </dl>
      </Panel>
    </>
  )
}
