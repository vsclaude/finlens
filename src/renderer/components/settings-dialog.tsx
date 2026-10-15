import { useEffect, useState } from "react"
import { CheckIcon } from "lucide-react"
import { useTheme } from "next-themes"

import type { AiLanguage, AppInfo, Palette } from "@shared/api"
import { Segmented } from "@/components/segmented"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"

/** Each palette's light `--primary`, drawn as its swatch. Literal rather than
 * `data-palette` on the swatch, because `indigo` has no block of its own and
 * would inherit whichever palette is on `<html>`. */
const SWATCHES: Record<Palette, string> = {
  indigo: "oklch(0.54 0.2 277)",
  graphite: "oklch(0.3 0 0)",
  teal: "oklch(0.52 0.11 192)",
  rose: "oklch(0.58 0.19 350)",
  amber: "oklch(0.72 0.15 70)",
}
const PALETTES = Object.keys(SWATCHES) as Palette[]

const PALETTE_LABEL: Record<Palette, string> = {
  indigo: "Chàm",
  graphite: "Than chì",
  teal: "Xanh ngọc",
  rose: "Hồng",
  amber: "Hổ phách",
}

type Theme = "system" | "light" | "dark"

/**
 * Settings: appearance and the analyst's language, as rows of a label on the
 * left and its control on the right. The model is picked in the AI page's
 * composer, where the choice is made.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { theme, setTheme } = useTheme()
  const palette = useSettings((state) => state.palette)
  const language = useSettings((state) => state.aiLanguage)
  const setSetting = useSettings((state) => state.set)
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    if (!open) return
    void window.desktop.appInfo().then(setInfo)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cài đặt</DialogTitle>
          <DialogDescription>
            {info ? `${info.name} · phiên bản ${info.version}` : " "}
          </DialogDescription>
        </DialogHeader>

        <Group title="Giao diện">
          <Row label="Chế độ hiển thị" hint="Phím tắt: D">
            <Segmented<Theme>
              value={(theme as Theme | undefined) ?? "system"}
              onChange={setTheme}
              options={[
                { value: "system", label: "Theo hệ thống" },
                { value: "light", label: "Sáng" },
                { value: "dark", label: "Tối" },
              ]}
            />
          </Row>
          <Row label="Màu nhấn" hint={PALETTE_LABEL[palette]}>
            <div role="radiogroup" className="flex items-center gap-2">
              {PALETTES.map((each) => (
                <button
                  key={each}
                  type="button"
                  role="radio"
                  aria-checked={palette === each}
                  title={PALETTE_LABEL[each]}
                  aria-label={PALETTE_LABEL[each]}
                  style={{ backgroundColor: SWATCHES[each] }}
                  onClick={() => void setSetting("palette", each)}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/40",
                    palette === each && "ring-2 ring-ring hover:ring-ring"
                  )}
                >
                  {palette === each && <CheckIcon className="size-3.5" />}
                </button>
              ))}
            </div>
          </Row>
        </Group>

        <Group title="AI Analyst">
          <Row label="Ngôn ngữ trả lời" hint="Áp dụng từ câu hỏi tiếp theo">
            <Segmented<AiLanguage>
              value={language}
              onChange={(next) => void setSetting("aiLanguage", next)}
              options={[
                { value: "vi", label: "Tiếng Việt" },
                { value: "en", label: "English" },
              ]}
            />
          </Row>
        </Group>
      </DialogContent>
    </Dialog>
  )
}

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y divide-border rounded-lg ring-1 ring-foreground/8">
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
