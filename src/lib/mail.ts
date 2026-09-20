import { boardTitle, visibleEvents } from './board-html'
import type { BoardModel } from './types'

export interface MailDraft {
  to: string
  cc: string
  subject: string
  body: string
}

/**
 * Mail clients and the OS handlers in front of them truncate long mailto:
 * URLs, so the draft stays well under the limit every client agrees on.
 */
export const MAILTO_MAX_LENGTH = 1800

/** Accepts the separators people actually type: commas, semicolons, spaces. */
export function parseRecipients(value: string): string[] {
  const seen = new Set<string>()
  for (const part of value.split(/[,;\s]+/)) {
    const address = part.trim()
    if (address) seen.add(address)
  }
  return [...seen]
}

export function defaultSubject(model: BoardModel): string {
  return boardTitle(model)
}

export function defaultBody(model: BoardModel, sheets: number): string {
  const events = visibleEvents(model).length
  const sheetText = sheets === 1 ? '1 sheet' : `${sheets} sheets`
  const eventText = events === 1 ? '1 event' : `${events} events`
  const where = model.property ? ` for ${model.property}` : ''
  const date = model.dateText ? ` for ${model.dateText}` : ''
  return [
    `Attached is the lobby board${where}${date}.`,
    `${eventText} on ${sheetText}.`,
  ].join('\r\n')
}

/**
 * The mailto: branch cannot carry the file, so the note tells the reader's
 * sender where the browser just put it.
 */
export function withAttachmentNote(body: string, fileName: string): string {
  return `${body}\r\n\r\n(Attach ${fileName} — your browser saved it to your downloads folder.)`
}

/**
 * mailto: with the draft prefilled. Recipients keep their separating commas —
 * that is the one character clients parse as a list — everything else is
 * percent-encoded, and line breaks go out as CRLF per RFC 6068.
 */
export function mailtoUrl(draft: MailDraft): string {
  // RFC 6068 allows `@` unescaped in an address, and Outlook has a long
  // history of showing a `%40` it was handed verbatim in the To field.
  const addresses = (value: string) =>
    parseRecipients(value)
      .map((address) => encodeURIComponent(address).replaceAll('%40', '@'))
      .join(',')

  const params: string[] = []
  const cc = addresses(draft.cc)
  if (cc) params.push(`cc=${cc}`)
  if (draft.subject) params.push(`subject=${encodeURIComponent(draft.subject)}`)

  const head = 'mailto:' + addresses(draft.to) + (params.length ? '?' + params.join('&') : '')
  if (!draft.body) return head

  // Trim the body itself rather than the finished URL: cutting the string
  // after encoding could slice a percent-escape in half.
  const separator = params.length ? '&' : '?'
  let body = draft.body.replace(/\r?\n/g, '\r\n')
  let url = `${head}${separator}body=${encodeURIComponent(body)}`
  while (url.length > MAILTO_MAX_LENGTH && body.length > 0) {
    body = body.slice(0, Math.max(0, body.length - Math.ceil((url.length - MAILTO_MAX_LENGTH) / 3)))
    url = `${head}${separator}body=${encodeURIComponent(body)}`
  }
  return url
}
