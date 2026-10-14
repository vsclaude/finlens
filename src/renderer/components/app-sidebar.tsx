import {
  BotIcon,
  BriefcaseIcon,
  CandlestickChartIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAi } from "@/lib/ai"
import { useNav, type Page } from "@/lib/nav"
import { cn } from "@/lib/utils"

const ITEMS: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "dashboard", label: "Tổng quan", icon: LayoutDashboardIcon },
  { page: "market", label: "Thị trường", icon: TrendingUpIcon },
  { page: "chart", label: "Biểu đồ", icon: CandlestickChartIcon },
  { page: "portfolio", label: "Danh mục", icon: BriefcaseIcon },
  { page: "ai", label: "AI Analyst", icon: BotIcon },
]

/** The app's navigation, in the window's chrome colour. ⌘1–⌘5 in the menu
 * follow the same order. */
export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const page = useNav((state) => state.page)
  const go = useNav((state) => state.go)
  const thinking = useAi((state) =>
    state.threads.some((each) => each.status === "running")
  )

  return (
    <nav className="flex w-48 shrink-0 flex-col gap-0.5 px-2 pb-2">
      {ITEMS.map(({ page: target, label, icon: Icon }, index) => (
        <button
          key={target}
          type="button"
          onClick={() => go(target)}
          title={`${label} (Ctrl/⌘ ${index + 1})`}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            page === target &&
              "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          )}
        >
          <Icon
            className={cn("size-4", page === target && "text-sidebar-primary")}
          />
          <span className="flex-1 text-left">{label}</span>
          {target === "ai" && thinking && (
            <span className="size-1.5 animate-pulse rounded-full bg-sidebar-primary" />
          )}
        </button>
      ))}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2.5 px-2.5 text-sidebar-foreground/75"
        onClick={onOpenSettings}
      >
        <SettingsIcon />
        Cài đặt
      </Button>
    </nav>
  )
}
