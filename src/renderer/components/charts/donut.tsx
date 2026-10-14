import { useState, type ReactNode } from "react"

export type Slice = { label: string; value: number; color: string }

/**
 * Proportions of a whole, with the centre free for the total. A donut rather
 * than a bar because the question it answers is "how concentrated am I",
 * which is the share of the ring the biggest slice takes.
 *
 * Hovering a slice (or its legend row, which the caller draws) puts that
 * slice's label and share in the centre.
 */
export function Donut({
  slices,
  size = 168,
  thickness = 22,
  center,
}: {
  slices: Slice[]
  size?: number
  thickness?: number
  center?: ReactNode
}) {
  const [hover, setHover] = useState<number | null>(null)
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  // A hairline between slices, in the ring's own background, so neighbours
  // of similar colour still read as two.
  const gap = slices.length > 1 ? 1.5 : 0

  const lengths = slices.map((slice) =>
    total ? (slice.value / total) * circumference : 0
  )
  const arcs = slices.map((slice, i) => ({
    i,
    slice,
    dash: `${Math.max(0, lengths[i]! - gap)} ${circumference}`,
    // Each arc starts where the ones before it ended.
    offset: -lengths.slice(0, i).reduce((sum, length) => sum + length, 0),
  }))
  const focused = hover != null ? slices[hover] : undefined

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.slice.color}
            strokeWidth={hover === arc.i ? thickness + 4 : thickness}
            strokeDasharray={arc.dash}
            strokeDashoffset={arc.offset}
            className="transition-[stroke-width] duration-150"
            onMouseEnter={() => setHover(arc.i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {focused ? (
          <>
            <span className="max-w-[70%] truncate text-xs text-muted-foreground">
              {focused.label}
            </span>
            <span className="tabular text-lg font-semibold">
              {total ? ((focused.value / total) * 100).toFixed(1) : "0"}%
            </span>
          </>
        ) : (
          center
        )}
      </div>
    </div>
  )
}

/** The chart palette, cycled — five tokens, then their lighter selves. */
export function sliceColor(index: number): string {
  const token = `var(--chart-${(index % 5) + 1})`
  return index < 5
    ? token
    : `color-mix(in oklab, ${token} 55%, var(--background))`
}
