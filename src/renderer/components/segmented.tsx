import { cn } from "@/lib/utils"

/**
 * A row of mutually exclusive options — an interval, a market, a window.
 * Buttons rather than `Tabs`: there is no panel behind each option, only a
 * value, and tabs announce panels to a screen reader.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex h-7 items-center rounded-lg bg-muted p-[3px]",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-full rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
            value === option.value &&
              "bg-background text-foreground shadow-xs dark:bg-input/40"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
