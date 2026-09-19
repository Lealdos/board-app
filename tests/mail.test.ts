import { describe, expect, test } from 'bun:test'
import { boardFileName } from '../src/lib/board-file'
import {
  MAILTO_MAX_LENGTH,
  defaultBody,
  defaultSubject,
  mailtoUrl,
  parseRecipients,
  withAttachmentNote,
} from '../src/lib/mail'
import type { BoardModel } from '../src/lib/types'

function model(patch: Partial<BoardModel> = {}): BoardModel {
  return {
    property: 'COLUMBUS HR',
    dateText: 'Sunday, September 6, 2026',
    groups: [{ id: 'g1', name: 'MATSURICON' }],
    events: [
      { id: 'e1', groupId: 'g1', start: '07:00 AM', end: '06:00 PM', title: 'A', room: 'R1', hidden: false },
      { id: 'e2', groupId: 'g1', start: '08:00 AM', end: '09:00 AM', title: 'B', room: 'R2', hidden: true },
    ],
    warnings: [],
    sourceName: 'RBL.pdf',
    ...patch,
  }
}

describe('boardFileName', () => {
  test('names the file after the board date', () => {
    expect(boardFileName(model())).toBe('elevator-board-2026-09-06.pdf')
  })

  test('honours the extension it is given', () => {
    expect(boardFileName(model(), 'html')).toBe('elevator-board-2026-09-06.html')
  })

  test('falls back when the date is missing or unreadable', () => {
    expect(boardFileName(model({ dateText: '' }))).toBe('elevator-board.pdf')
    expect(boardFileName(model({ dateText: 'not a date' }))).toBe('elevator-board.pdf')
  })
})

describe('parseRecipients', () => {
  test('splits on commas, semicolons and stray whitespace', () => {
    expect(parseRecipients('a@x.com, b@x.com;  c@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
    ])
  })

  test('drops empties and duplicates', () => {
    expect(parseRecipients(' , ;; a@x.com , a@x.com ')).toEqual(['a@x.com'])
    expect(parseRecipients('')).toEqual([])
  })
})

describe('the default draft', () => {
  test('subject is the board title', () => {
    expect(defaultSubject(model())).toBe('Daily Event Schedule - Sunday, September 6, 2026')
  })

  test('body counts only the events still on the board', () => {
    const body = defaultBody(model(), 1)
    expect(body).toContain('COLUMBUS HR')
    expect(body).toContain('Sunday, September 6, 2026')
    expect(body).toContain('1 event on 1 sheet.')
  })

  test('body pluralises sheets', () => {
    expect(defaultBody(model(), 2)).toContain('on 2 sheets.')
  })

  test('the attachment note names the downloaded file', () => {
    expect(withAttachmentNote('Hello', 'elevator-board-2026-09-06.pdf')).toContain(
      '(Attach elevator-board-2026-09-06.pdf',
    )
  })
})

describe('mailtoUrl', () => {
  test('keeps the commas that separate recipients', () => {
    const url = mailtoUrl({ to: 'a@x.com; b@x.com', cc: '', subject: '', body: '' })
    expect(url).toBe('mailto:a@x.com,b@x.com')
  })

  test('encodes the parts that would otherwise break the query', () => {
    const url = mailtoUrl({
      to: 'a@x.com',
      cc: 'c@x.com',
      subject: 'Board & café — ready?',
      body: '',
    })
    expect(url).toContain('cc=c@x.com')
    expect(url).toContain('subject=Board%20%26%20caf%C3%A9%20%E2%80%94%20ready%3F')
    expect(url.indexOf('?')).toBe(url.lastIndexOf('?'))
  })

  test('sends line breaks as CRLF', () => {
    const url = mailtoUrl({ to: 'a@x.com', cc: '', subject: '', body: 'one\ntwo' })
    expect(url).toContain('body=one%0D%0Atwo')
  })

  test('omits the parts that are empty', () => {
    expect(mailtoUrl({ to: '', cc: '', subject: '', body: '' })).toBe('mailto:')
  })

  test('trims a long body instead of slicing a percent-escape in half', () => {
    const url = mailtoUrl({
      to: 'a@x.com',
      cc: '',
      subject: 'Board',
      body: 'é'.repeat(2000),
    })
    expect(url.length).toBeLessThanOrEqual(MAILTO_MAX_LENGTH)
    expect(() => decodeURIComponent(url)).not.toThrow()
    expect(url).toContain('subject=Board')
  })

  test('the default draft fits in one mailto: URL', () => {
    const url = mailtoUrl({
      to: 'lobby@example.com, frontdesk@example.com',
      cc: 'manager@example.com',
      subject: defaultSubject(model()),
      body: withAttachmentNote(defaultBody(model(), 2), boardFileName(model())),
    })
    expect(url.length).toBeLessThan(MAILTO_MAX_LENGTH)
  })
})
