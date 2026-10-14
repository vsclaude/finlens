import { TrendingDownIcon, TrendingUpIcon } from "lucide-react"

import { direction, formatPct } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The colour class for a change — every up/down number in the app uses it. */
export function toneClass(value: number | null | undefined): string {
  const way = direction(value)
  return way === "up"
    ? "text-up"
    : way === "down"
      ? "text-down"
      : "text-muted-foreground"
}

/** A percent change, coloured, optionally as a filled pill. */
export function Change({
  value,
  pill = false,
  icon = false,
  className,
}: {
  value: number | null | undefined
  pill?: boolean
  icon?: boolean
  className?: string
}) {
  const way = direction(value)
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 font-medium",
        toneClass(value),
        pill && "rounded-md px-1.5 py-0.5 text-xs",
        pill && way === "up" && "bg-up/12",
        pill && way === "down" && "bg-down/12",
        pill && way === "flat" && "bg-muted",
        className
      )}
    >
      {icon && way === "up" && <TrendingUpIcon className="size-3.5" />}
      {icon && way === "down" && <TrendingDownIcon className="size-3.5" />}
      {formatPct(value)}
    </span>
  )
}
