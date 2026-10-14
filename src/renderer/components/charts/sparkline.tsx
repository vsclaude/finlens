import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * A line with no axes, coloured by whether it ended above where it began.
 * Stretches to its box (`preserveAspectRatio="none"`) with a non-scaling
 * stroke, so one component serves a table cell and a card alike.
 */
export function Sparkline({
  values,
  className,
  fill = true,
}: {
  values: number[]
  className?: string
  fill?: boolean
}) {
  const id = useId()
  if (values.length < 2) return <div className={className} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const width = 100
  const height = 32
  const points = values.map((value, i) => [
    (i / (values.length - 1)) * width,
    // A pixel of headroom so the stroke is not clipped at the extremes.
    height - 1 - ((value - min) / span) * (height - 2),
  ])
  const line = points
    .map(([x, y]) => `${x!.toFixed(2)},${y!.toFixed(2)}`)
    .join(" ")
  const up = values.at(-1)! >= values[0]!
  const colour = up ? "var(--up)" : "var(--down)"

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.22} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${height} ${line} ${width},${height}`}
            fill={`url(#${id})`}
          />
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
