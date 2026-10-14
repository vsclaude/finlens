/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk) — the heatmap on the
 * market page. Pure, and covered by `test/treemap.ts`.
 *
 * Squarified rather than slice-and-dice because a heatmap is read by its
 * labels: slice-and-dice gives the twentieth coin a sliver one pixel wide,
 * where squarifying keeps every cell as close to square as the sizes allow.
 */

export type Rect = { x: number; y: number; width: number; height: number }

export type Placed<T> = Rect & { item: T }

function worst(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0)
  const max = Math.max(...row)
  const min = Math.min(...row)
  const s2 = side * side
  const sum2 = sum * sum
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min))
}

/**
 * Lays `items` out in `bounds`, each with area in proportion to `value(item)`.
 * Items with no positive value are left out. Order is kept as given — sort
 * largest first for the best squares.
 */
export function squarify<T>(
  items: T[],
  value: (item: T) => number,
  bounds: Rect
): Placed<T>[] {
  const entries = items
    .map((item) => ({ item, value: value(item) }))
    .filter((each) => each.value > 0)
  const total = entries.reduce((sum, each) => sum + each.value, 0)
  if (!total || bounds.width <= 0 || bounds.height <= 0) return []

  const scale = (bounds.width * bounds.height) / total
  const areas = entries.map((each) => ({ ...each, area: each.value * scale }))
  const out: Placed<T>[] = []
  let rect = { ...bounds }
  let i = 0

  while (i < areas.length) {
    const side = Math.min(rect.width, rect.height)
    const row: typeof areas = [areas[i]!]
    i += 1
    while (i < areas.length) {
      const current = row.map((each) => each.area)
      const next = [...current, areas[i]!.area]
      if (worst(next, side) > worst(current, side)) break
      row.push(areas[i]!)
      i += 1
    }

    const rowArea = row.reduce((sum, each) => sum + each.area, 0)
    if (rect.width >= rect.height) {
      // A column down the left of what is left.
      const width = rowArea / rect.height
      let y = rect.y
      for (const each of row) {
        const height = each.area / width
        out.push({ item: each.item, x: rect.x, y, width, height })
        y += height
      }
      rect = { ...rect, x: rect.x + width, width: rect.width - width }
    } else {
      // A row across the top.
      const height = rowArea / rect.width
      let x = rect.x
      for (const each of row) {
        const width = each.area / height
        out.push({ item: each.item, x, y: rect.y, width, height })
        x += width
      }
      rect = { ...rect, y: rect.y + height, height: rect.height - height }
    }
  }
  return out
}
