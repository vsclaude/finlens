import { useEffect, useState } from "react"

/**
 * Theme tokens as concrete `rgb()` strings, for the one consumer that cannot
 * take a CSS variable: lightweight-charts draws on a canvas and parses colours
 * itself, and it does not know `oklch()`.
 *
 * Resolved by painting the token into a 1×1 canvas and reading the pixel back
 * — Chromium serialises an oklch `fillStyle` as oklch again, so asking the
 * context what it was set to answers the question with itself.
 */
const canvas =
  typeof document !== "undefined" ? document.createElement("canvas") : null

export function resolveToken(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  if (!raw || !canvas) return "rgb(128, 128, 128)"
  canvas.width = canvas.height = 1
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = raw
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return `rgba(${r}, ${g}, ${b}, ${(((a ?? 255) / 255) * alpha).toFixed(3)})`
}

export type ChartColors = {
  background: string
  text: string
  grid: string
  border: string
  up: string
  down: string
  upSoft: string
  downSoft: string
  series: string[]
}

function read(): ChartColors {
  return {
    background: resolveToken("--background"),
    text: resolveToken("--muted-foreground"),
    grid: resolveToken("--foreground", 0.06),
    border: resolveToken("--foreground", 0.12),
    up: resolveToken("--up"),
    down: resolveToken("--down"),
    upSoft: resolveToken("--up", 0.35),
    downSoft: resolveToken("--down", 0.35),
    series: [
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--chart-4",
      "--chart-5",
    ].map((name) => resolveToken(name)),
  }
}

/**
 * The chart colours, re-read whenever the theme or the palette changes —
 * both are attributes on `<html>` (`class="dark"`, `data-palette`), so one
 * observer there catches every switch.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-palette", "style"],
    })
    return () => observer.disconnect()
  }, [])
  return colors
}
