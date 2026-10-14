import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import type { AiAuth, AiLanguage, AppInfo, Palette } from "@shared/api"
import { ModelMenu } from "@/components/model-menu"
import { Segmented } from "@/components/segmented"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { forgetAiModels } from "@/lib/ai-models"
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
const THEMES = ["system", "light", "dark"] as const

/**
 * Settings: appearance, the analyst (model, language, API key), and where the
 * app keeps its files.
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
  const [auth, setAuth] = useState<AiAuth | null>(null)
  const [key, setKey] = useState("")

  useEffect(() => {
    if (!open) return
    void window.desktop.appInfo().then(setInfo)
    void window.desktop.getAiAuth().then(setAuth)
  }, [open])

  async function saveKey(value: string | null) {
    await window.desktop.setAiApiKey(value)
    forgetAiModels()
    setKey("")
    setAuth(await window.desktop.getAiAuth())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt</DialogTitle>
          <DialogDescription>
            {info ? `${info.name} ${info.version}` : " "}
          </DialogDescription>
        </DialogHeader>

        <Section title="Giao diện">
          <div className="flex gap-1">
            {THEMES.map((each) => (
              <Button
                key={each}
                size="sm"
                variant={theme === each ? "secondary" : "ghost"}
                onClick={() => setTheme(each)}
                className="capitalize"
              >
                {each}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            {PALETTES.map((each) => (
              <button
                key={each}
                type="button"
                title={each}
                aria-label={each}
                style={{ backgroundColor: SWATCHES[each] }}
                onClick={() => void setSetting("palette", each)}
                className={cn(
                  "size-6 rounded-full ring-offset-2 ring-offset-background",
                  palette === each && "ring-2 ring-ring"
                )}
              />
            ))}
          </div>
        </Section>

        <Section title="AI Analyst">
          <div>
            <ModelMenu
              side="bottom"
              className="-ml-1.5 h-8 text-sm text-foreground"
            />
          </div>
          <Segmented<AiLanguage>
            value={language}
            onChange={(next) => void setSetting("aiLanguage", next)}
            options={[
              { value: "vi", label: "Tiếng Việt" },
              { value: "en", label: "English" },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              Anthropic API key —{" "}
              {auth?.savedKey
                ? "đã lưu (mã hoá bằng keychain của hệ điều hành)"
                : auth?.envKey
                  ? "đang dùng ANTHROPIC_API_KEY từ môi trường"
                  : "chưa có; sẽ dùng tài khoản Claude Code đã đăng nhập trên máy"}
            </span>
            <div className="flex gap-2">
              <Input
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!key.trim()}
                onClick={() => void saveKey(key)}
              >
                Lưu
              </Button>
              {auth?.savedKey && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void saveKey(null)}
                >
                  Xoá
                </Button>
              )}
            </div>
          </div>
        </Section>

        {info && (
          <Section title="Dữ liệu">
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                {info.dataDir}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void window.desktop.revealPath(info.dataDir)}
              >
                Mở
              </Button>
            </div>
          </Section>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}
