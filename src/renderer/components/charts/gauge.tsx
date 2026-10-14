import { useId } from "react"

/**
 * A half-dial from 0 to 100 — the Fear & Greed index, and the chart page's
 * technical score mapped onto the same scale. The track runs from `--down`
 * through the muted middle to `--up`, so the needle's position and its colour
 * say the same thing.
 */
export function Gauge({
  value,
  label,
  caption,
  size = 180,
}: {
  /** 0–100. */
  value: number
  label: string
  caption?: string
  size?: number
}) {
  const id = useId()
  const clamped = Math.max(0, Math.min(100, value))
  const stroke = 12
  const radius = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const height = size / 2 + stroke
  const angle = Math.PI * (1 - clamped / 100)
  const nx = cx + (radius - stroke * 1.4) * Math.cos(angle)
  const ny = cy - (radius - stroke * 1.4) * Math.sin(angle)
  const arc = `M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${cy}`
  const tone =
    clamped >= 55
      ? `color-mix(in oklab, var(--up) ${40 + clamped * 0.6}%, var(--muted-foreground))`
      : clamped <= 45
        ? `color-mix(in oklab, var(--down) ${100 - clamped}%, var(--muted-foreground))`
        : "var(--muted-foreground)"

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={height}
        viewBox={`0 0 ${size} ${height}`}
        aria-hidden
      >
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--down)" />
            <stop
              offset="50%"
              stopColor="var(--muted-foreground)"
              stopOpacity={0.5}
            />
            <stop offset="100%" stopColor="var(--up)" />
          </linearGradient>
        </defs>
        <path
          d={arc}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          opacity={0.85}
        />
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          stroke="var(--foreground)"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={5} fill="var(--foreground)" />
      </svg>
      <div className="-mt-1 flex flex-col items-center">
        <span
          className="tabular text-2xl font-semibold"
          style={{ color: tone }}
        >
          {Math.round(clamped)}
        </span>
        <span className="text-sm font-medium">{label}</span>
        {caption && (
          <span className="text-xs text-muted-foreground">{caption}</span>
        )}
      </div>
    </div>
  )
}
