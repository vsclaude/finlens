/**
 * The renderer's pure halves: number formatting and the heatmap's treemap.
 */
import {
  direction,
  formatCompact,
  formatMoney,
  formatPct,
  formatPrice,
} from "../src/renderer/lib/format"
import { squarify } from "../src/renderer/lib/treemap"
import { errorMessage } from "../src/renderer/lib/utils"
import { check, finish, section } from "./harness"

section("format")
check("đồng has no decimals", formatPrice(57_100, "VND") === "57,100")
check("dollars have two", formatPrice(81_700.014, "USD") === "81,700.01")
check(
  "a sub-cent coin keeps its digits",
  formatPrice(0.00001234, "USD") === "0.00001234",
  formatPrice(0.00001234, "USD")
)
check(
  "money marks its currency",
  formatMoney(1234.5, "USD") === "$1,234.50" &&
    formatMoney(57_100, "VND") === "57,100 ₫"
)
check("negative money leads with a minus", formatMoney(-5, "USD") === "−$5.00")
check(
  "percent is signed",
  formatPct(1.234) === "+1.23%" &&
    formatPct(-0.4) === "−0.40%" &&
    formatPct(0) === "0.00%"
)
check(
  "missing is a dash",
  formatPct(null) === "—" && formatPrice(Number.NaN) === "—"
)
check(
  "compact",
  formatCompact(1.64e12) === "1.6T" &&
    formatCompact(340_500_000) === "340.5M" &&
    formatCompact(950) === "950"
)
check(
  "direction",
  direction(1) === "up" && direction(-1) === "down" && direction(0) === "flat"
)
check(
  "an IPC error loses its wrapper",
  errorMessage(
    new Error("Error invoking remote method 'portfolio:add': Error: Bán 5 FPT")
  ) === "Bán 5 FPT"
)

section("squarify")
const bounds = { x: 0, y: 0, width: 600, height: 400 }
const values = [500, 300, 120, 50, 20, 10]
const placed = squarify(values, (v) => v, bounds)
const area = placed.reduce((sum, cell) => sum + cell.width * cell.height, 0)
check("fills the box", Math.abs(area - 600 * 400) < 1e-6, area)
check("every item placed", placed.length === values.length)
const total = values.reduce((a, b) => a + b, 0)
check(
  "each area is in proportion",
  placed.every(
    (cell) =>
      Math.abs((cell.width * cell.height) / (600 * 400) - cell.item / total) <
      1e-9
  )
)
check(
  "nothing leaves the box",
  placed.every(
    (c) =>
      c.x >= -1e-9 &&
      c.y >= -1e-9 &&
      c.x + c.width <= 600 + 1e-6 &&
      c.y + c.height <= 400 + 1e-6
  )
)
const worstRatio = Math.max(
  ...placed.map((c) => Math.max(c.width / c.height, c.height / c.width))
)
check("cells stay reasonably square", worstRatio < 4, worstRatio)
check(
  "zero and negative sizes are skipped",
  squarify([0, -1, 5], (v) => v, bounds).length === 1
)
check(
  "an empty box places nothing",
  squarify([1], (v) => v, { x: 0, y: 0, width: 0, height: 10 }).length === 0
)

finish()
