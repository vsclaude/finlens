import { useEffect, useState } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { AiPage } from "@/components/pages/ai-page"
import { ChartPage } from "@/components/pages/chart-page"
import { DashboardPage } from "@/components/pages/dashboard-page"
import { MarketPage } from "@/components/pages/market-page"
import { PortfolioPage } from "@/components/pages/portfolio-page"
import { SettingsDialog } from "@/components/settings-dialog"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAi } from "@/lib/ai"
import { useNav } from "@/lib/nav"
import { usePortfolio } from "@/lib/portfolio"
import { useSettings } from "@/lib/settings"
import { useWatchlist } from "@/lib/watchlist"

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const palette = useSettings((state) => state.palette)
  const page = useNav((state) => state.page)

  useEffect(() => {
    void useSettings.getState().load()
    void useWatchlist.getState().load()
    void usePortfolio.getState().load()
    void useAi.getState().load()
    const unsubscribe = [
      useWatchlist.getState().listen(),
      usePortfolio.getState().listen(),
      useAi.getState().listen(),
    ]
    return () => unsubscribe.forEach((off) => off())
  }, [])

  // `indigo` is the stylesheet's own `:root`, so it is the attribute's absence.
  useEffect(() => {
    const root = document.documentElement
    if (palette === "indigo") delete root.dataset.palette
    else root.dataset.palette = palette
  }, [palette])

  useEffect(
    () =>
      window.desktop.onMenuCommand((command) => {
        const nav = useNav.getState()
        if (command === "open-settings") setSettingsOpen(true)
        else if (command === "new-analysis") nav.openThread(null)
        else nav.go(command.slice("page:".length) as typeof nav.page)
      }),
    []
  )

  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-sidebar">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
            <main className="mr-2 mb-2 min-w-0 flex-1 overflow-auto rounded-lg bg-background shadow-xs">
              {page === "dashboard" && <DashboardPage />}
              {page === "market" && <MarketPage />}
              {page === "chart" && <ChartPage />}
              {page === "portfolio" && <PortfolioPage />}
              {page === "ai" && <AiPage />}
            </main>
          </div>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </TooltipProvider>
    </ThemeProvider>
  )
}

/**
 * The window's own header, 44px to match `trafficLightPosition` in
 * `main/main.ts`. On macOS it is the only thing to drag the window by, so the
 * whole of it is the drag region — the sidebar below holds every button.
 */
function TitleBar() {
  const isMac = window.desktop.platform === "darwin"
  return (
    <header className="drag-region flex h-11 shrink-0 items-center">
      {/* Room for the traffic lights. */}
      {isMac && <div className="h-full w-20 shrink-0" />}
      <div className="flex items-center gap-2 px-4">
        <span className="flex size-5 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          F
        </span>
        <span className="text-sm font-semibold tracking-tight">FinLens</span>
      </div>
    </header>
  )
}
