import type { BoardModel, EventGroup, EventRow, PdfPageText, PdfTextItem } from './types'

/**
 * Geometry of the RBL report (BIRT Report Engine / OpenPDF), measured on the
 * sample reports. Every value has generous tolerance so a template tweak only
 * needs editing here.
 *
 *   font 22  centered            -> property           "COLUMBUS HR"
 *   font 16  centered            -> date or group name "Friday, August 14, 2026"
 *   font 13  x=28.1              -> time               "07:00 AM - 06:00 PM"
 *   font 13  x=211.4             -> title              (may span several lines)
 *   font 13  x=414.4             -> room               "DELAWARE C"
 */
export const LAYOUT_HINTS = {
  propertyMinFontSize: 18,
  headingMinFontSize: 14.5,
  timeColumnMaxX: 150,
  roomColumnMinX: 400,
  /** Same-line runs share a baseline within a fraction of a point. */
  sameLineTolerance: 1.5,
} as const

const TIME_RANGE = /^(\d{1,2}:\d{2}\s?[AP]M)\s*-\s*(\d{1,2}:\d{2}\s?[AP]M)$/i
const DATE_LINE = /^[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d{1,2},\s+\d{4}$/

export function isTimeRange(text: string): boolean {
  return TIME_RANGE.test(text.trim())
}

export function isDateLine(text: string): boolean {
  return DATE_LINE.test(text.trim())
}

type Zone = 'time' | 'title' | 'room'

function zoneOf(x: number): Zone {
  if (x < LAYOUT_HINTS.timeColumnMaxX) return 'time'
  if (x >= LAYOUT_HINTS.roomColumnMinX) return 'room'
  return 'title'
}

/**
 * Merges text runs that sit on the same baseline into one line. Runs are only
 * merged inside the same column: the time cell's baseline sits within a point
 * of the title and room next to it, so merging across columns would glue a
 * whole row into one string.
 */
function toLines(items: PdfTextItem[]): PdfTextItem[] {
  const kept = items.filter((item) => item.text.trim().length > 0)
  const sorted = [...kept].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: PdfTextItem[] = []

  for (const item of sorted) {
    const last = lines[lines.length - 1]
    const sameLine =
      last !== undefined &&
      Math.abs(last.y - item.y) <= LAYOUT_HINTS.sameLineTolerance &&
      Math.abs(last.fontSize - item.fontSize) < 0.5 &&
      zoneOf(last.x) === zoneOf(item.x) &&
      item.x > last.x
    if (sameLine) {
      last.text = `${last.text} ${item.text.trim()}`.replace(/\s+/g, ' ')
    } else {
      lines.push({ ...item, text: item.text.trim() })
    }
  }
  return lines
}

interface RowAnchor {
  start: string
  end: string
  y: number
  page: number
  groupIndex: number
  titleLines: { y: number; text: string }[]
  room: string
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

/**
 * Turns the positioned text of an RBL report into a board model.
 * Pure and DOM-free so it can be unit tested outside the browser.
 */
export function buildModel(pages: PdfPageText[], sourceName = ''): BoardModel {
  const warnings: string[] = []
  const groups: EventGroup[] = []
  const anchors: RowAnchor[] = []

  let property = ''
  let dateText = ''
  let currentGroup = -1

  for (const page of pages) {
    const lines = toLines(page.items)
    const pending: { y: number; text: string; x: number }[] = []

    for (const line of lines) {
      const text = line.text

      if (line.fontSize >= LAYOUT_HINTS.propertyMinFontSize) {
        // Repeated on every page; the first one wins.
        if (!property) property = text
        continue
      }

      if (line.fontSize >= LAYOUT_HINTS.headingMinFontSize) {
        if (isDateLine(text)) {
          if (!dateText) dateText = text
          continue
        }
        // Anything else at heading size is a client / group band. A group keeps
        // applying across page breaks until the next band shows up.
        groups.push({ id: nextId('group'), name: text })
        currentGroup = groups.length - 1
        continue
      }

      if (line.x < LAYOUT_HINTS.timeColumnMaxX && isTimeRange(text)) {
        const [, start, end] = TIME_RANGE.exec(text.trim()) as RegExpExecArray
        anchors.push({
          start: start.toUpperCase().replace(/\s+/g, ' '),
          end: end.toUpperCase().replace(/\s+/g, ' '),
          y: line.y,
          page: page.page,
          groupIndex: currentGroup,
          titleLines: [],
          room: '',
        })
        continue
      }

      pending.push({ y: line.y, text, x: line.x })
    }

    // Attach titles and rooms to the nearest time anchor on the same page. A
    // three-line title puts lines 15pt above and below its time; the next row
    // is at least 35pt away, so "nearest" is unambiguous.
    const pageAnchors = anchors.filter((anchor) => anchor.page === page.page)
    for (const item of pending) {
      const anchor = nearestAnchor(pageAnchors, item.y)
      if (!anchor) {
        warnings.push(`Ignored stray text on page ${page.page}: "${item.text}"`)
        continue
      }
      if (item.x >= LAYOUT_HINTS.roomColumnMinX) {
        anchor.room = anchor.room ? `${anchor.room} ${item.text}` : item.text
      } else {
        anchor.titleLines.push({ y: item.y, text: item.text })
      }
    }
  }

  const events: EventRow[] = anchors.map((anchor) => {
    const title = anchor.titleLines
      .sort((a, b) => a.y - b.y)
      .map((line) => line.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return {
      id: nextId('event'),
      groupId: anchor.groupIndex >= 0 ? groups[anchor.groupIndex].id : '',
      start: anchor.start,
      end: anchor.end,
      title,
      room: anchor.room.trim(),
      hidden: false,
    }
  })

  for (const event of events) {
    if (!event.title) warnings.push(`Event at ${event.start} has no title.`)
    if (!event.room) warnings.push(`Event at ${event.start} has no room.`)
    if (!event.groupId) warnings.push(`Event at ${event.start} has no group heading above it.`)
  }
  if (!dateText) warnings.push('No date found in the report; enter it by hand.')
  if (!property) warnings.push('No property name found in the report; enter it by hand.')
  if (events.length === 0) warnings.push('No events found. Is this an RBL report?')

  // Drop group bands that ended up with no events (nothing to show for them).
  const usedGroupIds = new Set(events.map((event) => event.groupId))

  return {
    property,
    dateText,
    groups: groups.filter((group) => usedGroupIds.has(group.id)),
    events,
    warnings,
    sourceName,
  }
}

function nearestAnchor(anchors: RowAnchor[], y: number): RowAnchor | undefined {
  let best: RowAnchor | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const anchor of anchors) {
    const distance = Math.abs(anchor.y - y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = anchor
    }
  }
  return best
}
