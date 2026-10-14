import { useEffect, useRef, useState } from "react"

import { formatPct } from "@/lib/format"
import { squarify } from "@/lib/treemap"

export type HeatCell = {
  id: string
  label: string
  /** The cell's area. */
  size: number
  /** The cell's colour, a percent change. */
  change: number
  title?: string
  /** Drawn, but not clickable. */
  disabled?: boolean
}

/** The change at which a cell is fully saturated. Beyond ±8% a day the
 * difference no longer needs to be read off the colour. */
const SATURATE_AT = 8

function fillOf(change: number): string {
  // A stablecoin's ±0.01% is no move at all, and should not read as green.
  if (Math.abs(change) < 0.05) return "var(--muted)"
  const strength = Math.min(1, Math.abs(change) / SATURATE_AT)
  const token = change >= 0 ? "--up" : "--down"
  // Mixed into the card rather than faded by alpha, so the label on top
  // sits on an opaque colour whatever is behind the chart. In oklab, not
  // oklch: oklch interpolates the hue too, and the card's faint indigo tint
  // dragged a falling coin's red round through purple on the way.
  return `color-mix(in oklab, var(${token}) ${Math.round(18 + strength * 72)}%, var(--card))`
}

/**
 * A treemap heatmap — area by size (market cap), colour by change. Measures
 * its own box and lays the cells out to fill it.
 */
export function Heatmap({
  cells,
  onSelect,
  className,
}: {
  cells: HeatCell[]
  onSelect?: (cell: HeatCell) => void
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const placed = squarify(
    [...cells].sort((a, b) => b.size - a.size),
    (cell) => cell.size,
    { x: 0, y: 0, ...size }
  )

  return (
    <div ref={box} className={className}>
      <svg width={size.width} height={size.height} className="block">
        {placed.map(({ item, x, y, width, height }) => {
          const big = width > 64 && height > 40
          const fits = width > 34 && height > 22
          const font = Math.max(10, Math.min(22, Math.sqrt(width * height) / 6))
          return (
            <g
              key={item.id}
              className={item.disabled ? "cursor-default" : "cursor-pointer"}
              onClick={() => !item.disabled && onSelect?.(item)}
            >
              <title>
                {item.title ?? `${item.label} ${formatPct(item.change)}`}
              </title>
              <rect
                x={x + 1}
                y={y + 1}
                width={Math.max(0, width - 2)}
                height={Math.max(0, height - 2)}
                rx={4}
                style={{ fill: fillOf(item.change) }}
                className="transition-opacity hover:opacity-80"
              />
              {fits && (
                <text
                  x={x + width / 2}
                  y={y + height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none fill-foreground font-semibold"
                  style={{ fontSize: font }}
                >
                  <tspan x={x + width / 2} dy={big ? "-0.45em" : 0}>
                    {item.label}
                  </tspan>
                  {big && (
                    <tspan
                      x={x + width / 2}
                      dy="1.25em"
                      className="tabular font-medium"
                      style={{ fontSize: font * 0.62 }}
                    >
                      {formatPct(item.change)}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
