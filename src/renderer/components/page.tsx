import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Every page's frame: a title row with its actions, then the content. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-full flex-col gap-4 p-5", className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </header>
      {children}
    </div>
  )
}

/** A titled surface — the unit every page is built from. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl bg-card text-card-foreground ring-1 ring-foreground/8",
        className
      )}
    >
      {(title || actions) && (
        <div className="flex min-h-11 items-center justify-between gap-2 px-4 pt-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {actions && (
            <div className="flex items-center gap-1.5">{actions}</div>
          )}
        </div>
      )}
      <div
        className={cn(
          "min-h-0 flex-1 p-4",
          (title || actions) && "pt-2",
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** A label over a number — the KPI tiles. */
export function Stat({
  label,
  value,
  detail,
  className,
}: {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="tabular truncate text-xl font-semibold tracking-tight">
        {value}
      </span>
      {detail && <span className="truncate text-xs">{detail}</span>}
    </div>
  )
}

/** What a panel shows when its data failed or has not arrived. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
