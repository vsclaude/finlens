import { useState, type ComponentProps, type ReactNode } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  SignalHighIcon,
  SignalIcon,
  SignalLowIcon,
  SignalMediumIcon,
} from "lucide-react"

import {
  defaultModelAlias,
  effortFor,
  effortsOf,
  orderedModels,
  type AiEffort,
} from "@shared/ai-models"
import { ClaudeMark } from "@/components/claude-mark"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAiModels } from "@/lib/ai-models"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"

const EFFORT_LABELS: Record<AiEffort, string> = {
  low: "Thấp",
  medium: "Vừa",
  high: "Cao",
  xhigh: "Rất cao",
  max: "Tối đa",
}

/**
 * Which model answers and how hard it thinks — in the composer, and the same
 * control in Settings, since both are the one setting.
 *
 * **The rows are the CLI's**, not this app's (`main/ai/models.ts`): which
 * models exist is a property of the account. A model that takes effort levels
 * opens a submenu of them; clicking the row itself picks it at the level
 * already chosen where it takes that one (`effortFor`). The digits pick a row
 * from the keyboard, as in Claude Code's own picker.
 *
 * Main reads both settings at the start of each turn, so a pick applies to the
 * next question, mid-thread too.
 */
export function ModelMenu({ className }: { className?: string }) {
  const models = useAiModels()
  const model = useSettings((state) => state.aiModel)
  const effort = useSettings((state) => state.aiEffort)
  const setSetting = useSettings((state) => state.set)
  // Held only so a digit can close it; a click is Base UI's own business.
  const [open, setOpen] = useState(false)

  const rows = orderedModels(models)
  const chosen = rows.find((entry) => entry.value === model)
  const alias = defaultModelAlias(models)
  const shownEffort =
    effort && effortsOf(models, model).includes(effort) ? effort : null
  // The raw value where no row matches: the setting can name a model this
  // CLI no longer lists, and the honest answer is what the setting says.
  const label = `${chosen?.label ?? model}${shownEffort ? ` · ${EFFORT_LABELS[shownEffort]}` : ""}`

  function pick(value: string, level: AiEffort | null) {
    void setSetting("aiModel", value)
    void setSetting("aiEffort", level)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            icon={<ClaudeMark />}
            label={label}
            title="Model trả lời và mức độ suy nghĩ"
            className={className}
          />
        }
      />
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-72"
        onKeyDown={(event) => {
          const at = Number(event.key)
          if (!at || at > rows.length) return
          event.preventDefault()
          const target = rows[at - 1]!
          pick(target.value, effortFor(target.efforts, effort))
          setOpen(false)
        }}
      >
        {rows.map((entry, i) => {
          const selected = model === entry.value
          const row = (
            <>
              <span className="flex size-4 shrink-0 items-center justify-center">
                {selected && <CheckIcon className="size-3.5 text-foreground" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs">{entry.label}</span>
                  {/* `Default (recommended)` names no model, so the row says
                      which one it stands for. */}
                  {entry.value === "default" && alias && (
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                      {alias}
                    </span>
                  )}
                </span>
                <span className="truncate text-[0.6875rem] text-muted-foreground">
                  {entry.description}
                </span>
              </span>
              {selected && shownEffort && (
                <span className="text-[0.6875rem] text-muted-foreground/80">
                  {EFFORT_LABELS[shownEffort]}
                </span>
              )}
              {i < 9 && (
                <span className="w-3 text-right text-[0.6875rem] text-muted-foreground/60 tabular-nums">
                  {i + 1}
                </span>
              )}
            </>
          )

          if (entry.efforts.length === 0) {
            return (
              <DropdownMenuItem
                key={entry.value}
                onClick={() => pick(entry.value, null)}
                className="cursor-pointer gap-2 px-2 py-1.5"
              >
                {row}
              </DropdownMenuItem>
            )
          }
          return (
            <DropdownMenuSub key={entry.value}>
              <DropdownMenuSubTrigger
                onClick={() =>
                  pick(entry.value, effortFor(entry.efforts, effort))
                }
                className="cursor-pointer gap-2 px-2 py-1.5"
              >
                {row}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-36">
                {entry.efforts.map((level) => (
                  <DropdownMenuItem
                    key={level}
                    onClick={() => pick(entry.value, level)}
                    className="cursor-pointer justify-between px-2 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <EffortIcon effort={level} />
                      {EFFORT_LABELS[level]}
                    </span>
                    {selected && effort === level && (
                      <CheckIcon className="size-3.5 text-foreground" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EffortIcon({ effort }: { effort: AiEffort }) {
  if (effort === "low") return <SignalLowIcon />
  if (effort === "medium") return <SignalMediumIcon />
  if (effort === "high") return <SignalHighIcon />
  // `xhigh` and `max` are both four bars: lucide has no fifth, and the word
  // beside it is what tells them apart.
  return <SignalIcon />
}

/**
 * The trigger. Everything it is not asked about goes to the button, `ref`
 * included: Base UI clones the element it is handed and passes it the
 * trigger's props, so a button that dropped them would open its menu against
 * no anchor at all.
 */
function ToolbarButton({
  icon,
  label,
  className,
  ...rest
}: { icon: ReactNode; label: string } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[0.7rem] text-muted-foreground",
        "transition-colors hover:bg-accent hover:text-foreground",
        "data-[popup-open]:bg-accent data-[popup-open]:text-foreground",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className
      )}
      {...rest}
    >
      {icon}
      {label}
      <ChevronDownIcon className="size-3! opacity-60" />
    </button>
  )
}
