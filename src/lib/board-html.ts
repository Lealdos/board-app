import type { BoardLayout, BoardModel, ColumnItem, EventRow } from './types'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** "06:00 AM" -> "6:00 AM", for the column's range label. */
function trimLeadingZero(time: string): string {
  return time.replace(/^0/, '')
}

export function visibleEvents(model: BoardModel): EventRow[] {
  return model.events.filter((event) => !event.hidden)
}

/**
 * Flattens the model into the sequence the board renders: a group band
 * whenever the group changes, then that group's events.
 */
export function toColumnItems(model: BoardModel): ColumnItem[] {
  const items: ColumnItem[] = []
  let lastGroupId: string | null = null
  for (const event of visibleEvents(model)) {
    if (event.groupId !== lastGroupId) {
      if (event.groupId) items.push({ kind: 'band', groupId: event.groupId, continued: false })
      lastGroupId = event.groupId
    }
    items.push({ kind: 'event', eventId: event.id })
  }
  return items
}

function rowHtml(event: EventRow): string {
  return `<tr data-event-id="${escapeHtml(event.id)}">
    <td class="time-col">${escapeHtml(`${event.start} - ${event.end}`)}</td>
    <td class="title-col">${escapeHtml(event.title)}</td>
    <td class="room-col"><span class="room-badge">${escapeHtml(event.room)}</span></td>
</tr>`
}

function bandHtml(name: string, continued: boolean): string {
  const cont = continued ? ' <span class="cont">(cont.)</span>' : ''
  return `<div class="sub-heading">${escapeHtml(name)}${cont}</div>`
}

function countEvents(items: ColumnItem[]): number {
  return items.filter((item) => item.kind === 'event').length
}

/**
 * Renders one column's bands and tables; consecutive events share a table.
 * `gridRows` is the row count the column should divide its height by — pass the
 * busiest column on the sheet and a shorter column pads the leftover space at
 * the bottom, so rows line up across both columns.
 */
export function columnBodyHtml(items: ColumnItem[], model: BoardModel, gridRows = 0): string {
  const eventsById = new Map(model.events.map((event) => [event.id, event]))
  const groupsById = new Map(model.groups.map((group) => [group.id, group]))
  const parts: string[] = []
  let open: EventRow[] = []

  const flush = () => {
    if (open.length === 0) return
    parts.push(
      `<table class="event-table" style="--rows:${open.length};flex-grow:${open.length}">${open
        .map(rowHtml)
        .join('')}</table>`,
    )
    open = []
  }

  for (const item of items) {
    if (item.kind === 'band') {
      flush()
      parts.push(bandHtml(groupsById.get(item.groupId)?.name ?? '', item.continued))
    } else {
      const event = eventsById.get(item.eventId)
      if (event) open.push(event)
    }
  }
  flush()

  const filler = gridRows - countEvents(items)
  if (filler > 0) parts.push(`<div class="row-filler" style="flex-grow:${filler}"></div>`)
  return parts.join('')
}

function columnHtml(
  items: ColumnItem[],
  model: BoardModel,
  side: 'left' | 'right',
  gridRows: number,
): string {
  const eventsById = new Map(model.events.map((event) => [event.id, event]))
  const first = items.find((item) => item.kind === 'event')
  const firstEvent = first?.kind === 'event' ? eventsById.get(first.eventId) : undefined
  const range = firstEvent ? `FROM ${trimLeadingZero(firstEvent.start)}` : ''
  return `<div class="grid-col col-${side}">
    <div class="card">
        <div class="card-header"><span>Meetings &amp; Events</span><span class="range">${escapeHtml(range)}</span></div>
        <div class="card-body">${columnBodyHtml(items, model, gridRows)}</div>
    </div>
</div>`
}

export function sheetHtml(model: BoardModel, left: ColumnItem[], right: ColumnItem[]): string {
  const gridRows = Math.max(countEvents(left), countEvents(right))
  return `<div class="sheet">
    <div class="header">
        <h1>Daily Event Schedule</h1>
        <div class="subtitle">${escapeHtml(model.dateText)}</div>
        <div class="location-tag">${escapeHtml(model.property)}</div>
    </div>
    <div class="grid">${columnHtml(left, model, 'left', gridRows)}${columnHtml(right, model, 'right', gridRows)}</div>
</div>`
}

export function boardHtml(model: BoardModel, layout: BoardLayout): string {
  return layout.sheets.map((sheet) => sheetHtml(model, sheet.left, sheet.right)).join('')
}

export function boardTitle(model: BoardModel): string {
  return model.dateText ? `Daily Event Schedule - ${model.dateText}` : 'Daily Event Schedule'
}
