/** A single text run pulled out of the PDF, in top-left origin points. */
export interface PdfTextItem {
  text: string
  x: number
  y: number
  fontSize: number
  page: number
}

export interface PdfPageText {
  page: number
  width: number
  height: number
  items: PdfTextItem[]
}

export interface EventGroup {
  id: string
  /** Client / meeting host, e.g. "Matsuricon Cyberpunk City 2026". */
  name: string
}

export interface EventRow {
  id: string
  groupId: string
  /** Kept as printed on the RBL, e.g. "06:00 AM". */
  start: string
  end: string
  title: string
  room: string
  /** Excluded from the printed board but kept in the editor. */
  hidden: boolean
}

export interface BoardModel {
  /** Hotel / venue, e.g. "COLUMBUS HR". */
  property: string
  /** Date exactly as printed, e.g. "Sunday, September 6, 2026". */
  dateText: string
  groups: EventGroup[]
  /** Document order; the board keeps this order. */
  events: EventRow[]
  warnings: string[]
  sourceName: string
}

/** One entry in a rendered board column. */
export type ColumnItem =
  | { kind: 'band'; groupId: string; continued: boolean }
  | { kind: 'event'; eventId: string }

export interface BoardSheet {
  left: ColumnItem[]
  right: ColumnItem[]
}

export interface BoardLayout {
  sheets: BoardSheet[]
  /** Font scale applied to the whole board to make it fill the sheet. */
  scale: number
  /** True when even the smallest scale needed more than one sheet. */
  overflowed: boolean
}
