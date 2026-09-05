import { columnBodyHtml, sheetHtml, toColumnItems } from './board-html'
import type { BoardLayout, BoardModel, BoardSheet, ColumnItem } from './types'

export const MIN_SCALE = 0.72
export const MAX_SCALE = 1.15
const MAX_SHEETS = 4

export interface LayoutOptions {
  minScale?: number
  maxScale?: number
  maxSheets?: number
}

interface Measurements {
  /** Height available for bands and rows inside one column. */
  capacity: number
  /** Natural height of each item, keyed the same way as the item list. */
  heights: number[]
  /** False when a title word is too long for the column and would be split. */
  titlesFit: boolean
}

let measuringContext: CanvasRenderingContext2D | null = null

function textWidth(text: string, font: string): number {
  measuringContext ??= document.createElement('canvas').getContext('2d')
  if (!measuringContext) return 0
  measuringContext.font = font
  return measuringContext.measureText(text).width
}

/**
 * The time and room columns scale with the type, but the title column keeps
 * whatever is left over — so growing the board eventually forces the browser to
 * hyphenate a word ("CONVEN / TION FOAM FIGHTING"). Reject any scale where the
 * longest word no longer fits on one line.
 */
function titlesFitOnOneLine(cells: NodeListOf<HTMLElement>): boolean {
  for (const cell of cells) {
    const style = getComputedStyle(cell)
    const available =
      cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    for (const word of (cell.textContent ?? '').split(/\s+/)) {
      if (word && textWidth(word, font) > available) return false
    }
  }
  return true
}

/**
 * Column being filled. Every row on the board is given the same height so the
 * two columns read as one grid, so the space a column needs is its bands plus
 * rowCount x the tallest row anywhere on the board.
 */
interface ColumnState {
  items: ColumnItem[]
  bands: number
  rows: number
}

function emptyColumn(): ColumnState {
  return { items: [], bands: 0, rows: 0 }
}

/**
 * Measures the natural height of every band and row at a given font scale,
 * using an off-screen copy of a real sheet so the CSS is identical.
 */
function measure(
  host: HTMLElement,
  model: BoardModel,
  items: ColumnItem[],
  scale: number,
): Measurements {
  host.style.setProperty('--board-scale', String(scale))
  host.innerHTML = sheetHtml(model, [], [])

  const bodies = host.querySelectorAll<HTMLElement>('.card-body')
  const target = bodies[0]
  const empty = bodies[1]
  const capacity = empty.clientHeight

  // The leading spacer keeps the first band from matching `:first-child`, so
  // every band is measured with the same margins it will have when placed.
  target.innerHTML = `<div class="measure-spacer"></div>${columnBodyHtml(items, model)}`

  // Walk the rendered nodes in the same order as `items`.
  const heights: number[] = []
  const bands = target.querySelectorAll<HTMLElement>(':scope > .sub-heading')
  const rows = target.querySelectorAll<HTMLElement>('tr')
  let bandIndex = 0
  let rowIndex = 0
  for (const item of items) {
    if (item.kind === 'band') {
      const node = bands[bandIndex]
      bandIndex += 1
      const style = getComputedStyle(node)
      heights.push(
        node.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom),
      )
    } else {
      const node = rows[rowIndex]
      rowIndex += 1
      heights.push(node.offsetHeight)
    }
  }
  return {
    capacity,
    heights,
    titlesFit: titlesFitOnOneLine(target.querySelectorAll<HTMLElement>('.title-col')),
  }
}

/**
 * Fills columns in document order, never letting a column exceed `limit`.
 * A group band is never left stranded at the bottom of a column, and a group
 * that spills over gets a "(cont.)" band at the top of the next column.
 * Returns null when a single item cannot fit in an empty column.
 */
function pack(
  items: ColumnItem[],
  heights: number[],
  groupIds: string[],
  rowHeight: number,
  limit: number,
  bandHeightOf: (groupId: string) => number,
): ColumnItem[][] | null {
  const columns: ColumnItem[][] = []
  let current = emptyColumn()

  const columnHeight = (column: ColumnState) => column.bands + column.rows * rowHeight

  let index = 0
  while (index < items.length) {
    const item = items[index]

    if (item.kind === 'band') {
      const next = items[index + 1]
      const trial: ColumnState = {
        ...current,
        bands: current.bands + heights[index],
        rows: current.rows + (next?.kind === 'event' ? 1 : 0),
      }

      if (columnHeight(trial) > limit) {
        if (current.items.length === 0) return null
        columns.push(current.items)
        current = emptyColumn()
        continue
      }
      current = { ...current, bands: current.bands + heights[index] }
      current.items.push(item)
      index += 1
      continue
    }

    const trial: ColumnState = { ...current, rows: current.rows + 1 }
    if (columnHeight(trial) > limit) {
      if (current.items.length === 0) return null
      columns.push(current.items)
      current = emptyColumn()
      // The group carries into the new column, so repeat its band as "(cont.)".
      const groupId = groupIds[index]
      if (groupId) {
        current.items.push({ kind: 'band', groupId, continued: true })
        current.bands += bandHeightOf(groupId)
      }
      continue
    }
    current = trial
    current.items.push(item)
    index += 1
  }

  if (current.items.length > 0) columns.push(current.items)
  return columns
}

/** Group each item belongs to, so a column break knows which band to repeat. */
function groupIdsOf(items: ColumnItem[]): string[] {
  let currentGroup = ''
  return items.map((item) => {
    if (item.kind === 'band') currentGroup = item.groupId
    return currentGroup
  })
}

/** Smallest column height that still fits everything in `columnCount` columns. */
function balance(
  items: ColumnItem[],
  heights: number[],
  groupIds: string[],
  rowHeight: number,
  capacity: number,
  columnCount: number,
  bandHeightOf: (groupId: string) => number,
): ColumnItem[][] | null {
  const atCapacity = pack(items, heights, groupIds, rowHeight, capacity, bandHeightOf)
  if (!atCapacity || atCapacity.length > columnCount) return null

  let low = 0
  let high = capacity
  let best = atCapacity
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2
    const attempt = pack(items, heights, groupIds, rowHeight, mid, bandHeightOf)
    if (attempt && attempt.length <= columnCount) {
      best = attempt
      high = mid
    } else {
      low = mid
    }
  }
  return best
}

function toSheets(columns: ColumnItem[][], columnCount: number): BoardSheet[] {
  const padded = [...columns]
  while (padded.length < columnCount) padded.push([])
  const sheets: BoardSheet[] = []
  for (let i = 0; i < padded.length; i += 2) {
    sheets.push({ left: padded[i], right: padded[i + 1] ?? [] })
  }
  return sheets
}

/**
 * Works out how the board should be split into columns and sheets, and how big
 * the type can be. Prefers one sheet at the largest scale that fits; only adds
 * a sheet once even the smallest legible scale overflows.
 */
export function computeLayout(
  model: BoardModel,
  host: HTMLElement,
  options: LayoutOptions = {},
): BoardLayout {
  const minScale = options.minScale ?? MIN_SCALE
  const maxScale = options.maxScale ?? MAX_SCALE
  const maxSheets = options.maxSheets ?? MAX_SHEETS

  const items = toColumnItems(model)
  if (items.length === 0) {
    return { sheets: [{ left: [], right: [] }], scale: 1, overflowed: false }
  }
  const groupIds = groupIdsOf(items)

  // Widest type the title column can take without breaking a word.
  const widestReadableScale = (): number => {
    if (measure(host, model, items, maxScale).titlesFit) return maxScale
    if (!measure(host, model, items, minScale).titlesFit) return minScale
    let low = minScale
    let high = maxScale
    while (high - low > 0.01) {
      const mid = (low + high) / 2
      if (measure(host, model, items, mid).titlesFit) low = mid
      else high = mid
    }
    return low
  }
  const scaleCap = widestReadableScale()

  const attempt = (scale: number, columnCount: number): ColumnItem[][] | null => {
    const { capacity, heights } = measure(host, model, items, scale)
    const bandHeights = new Map<string, number>()
    items.forEach((item, index) => {
      if (item.kind === 'band' && !bandHeights.has(item.groupId)) {
        bandHeights.set(item.groupId, heights[index])
      }
    })
    const fallbackBand = Math.max(0, ...bandHeights.values())
    // One row height for the whole board: both columns land on the same grid.
    const rowHeight = Math.max(
      0,
      ...items.map((item, index) => (item.kind === 'event' ? heights[index] : 0)),
    )
    return balance(items, heights, groupIds, rowHeight, capacity, columnCount, (groupId) =>
      bandHeights.get(groupId) ?? fallbackBand,
    )
  }

  for (let sheets = 1; sheets <= maxSheets; sheets += 1) {
    const columnCount = sheets * 2

    // Largest scale that still fits, to 0.01.
    let low = minScale
    let high = scaleCap
    let best = attempt(scaleCap, columnCount)
    let bestScale = scaleCap

    if (!best) {
      best = attempt(minScale, columnCount)
      bestScale = minScale
      if (!best) continue
      while (high - low > 0.01) {
        const mid = (low + high) / 2
        const candidate = attempt(mid, columnCount)
        if (candidate) {
          best = candidate
          bestScale = mid
          low = mid
        } else {
          high = mid
        }
      }
    }

    return {
      sheets: toSheets(best, columnCount),
      scale: Math.round(bestScale * 100) / 100,
      overflowed: sheets > 1,
    }
  }

  // Nothing fits even at the smallest scale: show everything on one sheet and
  // let the caller surface the warning rather than silently dropping rows.
  return {
    sheets: [{ left: items, right: [] }],
    scale: minScale,
    overflowed: true,
  }
}
