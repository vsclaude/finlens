import { useEffect, useRef } from "react"
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts"

import type { Candle, Interval } from "@shared/api"
import { bollinger, ema, macd, rsi, sma, type Series } from "@shared/indicators"
import { useChartColors } from "@/lib/colors"
import { formatCompact, formatPrice } from "@/lib/format"

export type Overlay = "ma" | "bb" | "volume" | "rsi" | "macd"

/**
 * The chart page's chart: candles, with moving averages and Bollinger bands
 * over them, volume along the bottom, and RSI and MACD in panes of their own
 * — the same indicator functions the analyst reads, so what it says and what
 * this draws agree.
 *
 * Rebuilt whenever its inputs change rather than patched series by series:
 * it is a few milliseconds for 500 bars, and a patch-up path for every
 * combination of toggles is where charts go stale.
 */
export function PriceChart({
  candles,
  interval,
  currency,
  overlays,
}: {
  candles: Candle[]
  interval: Interval
  currency: string
  overlays: Set<Overlay>
}) {
  const box = useRef<HTMLDivElement>(null)
  const colors = useChartColors()
  const overlayKey = [...overlays].sort().join()

  useEffect(() => {
    const element = box.current
    if (!element || candles.length === 0) return

    // The providers answer in UTC, and lightweight-charts draws UTC. For
    // intraday bars that would put a Hanoi session at 02:00–07:45; shifted by
    // the local offset it reads 09:00–14:45, as on every broker's chart.
    const intraday = interval === "1h" || interval === "4h"
    const shift = intraday ? -new Date().getTimezoneOffset() * 60 : 0
    const at = (time: number) => (time + shift) as UTCTimestamp
    const closes = candles.map((bar) => bar.close)
    const line = (series: Series) =>
      series.flatMap((value, i) =>
        value == null ? [] : [{ time: at(candles[i]!.time), value }]
      )

    const chart: IChartApi = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.text,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        panes: {
          separatorColor: colors.border,
          separatorHoverColor: colors.grid,
        },
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: intraday,
        rightOffset: 6,
      },
      localization: {
        priceFormatter: (price: number) => formatPrice(price, currency),
      },
    })

    const main = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      borderVisible: false,
    })
    main.setData(
      candles.map((bar) => ({
        time: at(bar.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
    )

    const quiet = {
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }

    if (overlays.has("ma")) {
      const averages: [Series, string][] = [
        [ema(closes, 20), colors.series[0]!],
        [sma(closes, 50), colors.series[2]!],
        [sma(closes, 200), colors.series[4]!],
      ]
      for (const [series, color] of averages) {
        chart
          .addSeries(LineSeries, { color, lineWidth: 1, ...quiet })
          .setData(line(series))
      }
    }

    if (overlays.has("bb")) {
      const bands = bollinger(closes)
      const band = { color: colors.series[1]!, lineWidth: 1 as const, ...quiet }
      chart.addSeries(LineSeries, band).setData(line(bands.upper))
      chart.addSeries(LineSeries, band).setData(line(bands.lower))
      chart
        .addSeries(LineSeries, { ...band, lineStyle: LineStyle.Dotted })
        .setData(line(bands.middle))
    }

    if (overlays.has("volume")) {
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "custom", formatter: formatCompact },
        priceScaleId: "",
        ...quiet,
      })
      volume
        .priceScale()
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      volume.setData(
        candles.map((bar) => ({
          time: at(bar.time),
          value: bar.volume,
          color: bar.close >= bar.open ? colors.upSoft : colors.downSoft,
        }))
      )
    }

    let pane = 0
    if (overlays.has("rsi")) {
      pane += 1
      const series = chart.addSeries(
        LineSeries,
        {
          color: colors.series[0]!,
          lineWidth: 1,
          priceLineVisible: false,
          priceFormat: {
            type: "custom",
            formatter: (v: number) => v.toFixed(0),
          },
        },
        pane
      )
      series.setData(line(rsi(closes)))
      for (const level of [70, 30]) {
        series.createPriceLine({
          price: level,
          color: colors.border,
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: false,
        })
      }
    }

    if (overlays.has("macd")) {
      pane += 1
      const m = macd(closes)
      chart
        .addSeries(
          HistogramSeries,
          { priceLineVisible: false, lastValueVisible: false },
          pane
        )
        .setData(
          m.histogram.flatMap((value, i) =>
            value == null
              ? []
              : [
                  {
                    time: at(candles[i]!.time),
                    value,
                    color: value >= 0 ? colors.upSoft : colors.downSoft,
                  },
                ]
          )
        )
      chart
        .addSeries(
          LineSeries,
          { color: colors.series[0]!, lineWidth: 1, ...quiet },
          pane
        )
        .setData(line(m.macd))
      chart
        .addSeries(
          LineSeries,
          { color: colors.series[1]!, lineWidth: 1, ...quiet },
          pane
        )
        .setData(line(m.signal))
    }

    // The price pane keeps most of the height however many panes are open.
    const panes = chart.panes()
    panes[0]?.setStretchFactor(3)
    for (const each of panes.slice(1)) each.setStretchFactor(1)

    // The last ~150 bars rather than all 500 squeezed in: candles readable
    // on open, the rest a scroll away.
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, candles.length - 150),
      to: candles.length + 5,
    })

    return () => chart.remove()
    // `overlays` is read through `overlayKey`: a new Set every render would
    // rebuild the chart every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, interval, currency, overlayKey, colors])

  return <div ref={box} className="h-full w-full" />
}
