import { describe, expect, test } from 'bun:test'
import { buildModel, isDateLine, isTimeRange } from '../src/lib/rbl-parser'
import type { BoardModel } from '../src/lib/types'
import { extractPdfTextNode } from './extract-node'

async function parse(file: string): Promise<BoardModel> {
  return buildModel(await extractPdfTextNode(`tests/fixtures/${file}`), file)
}

function groupNames(model: BoardModel): string[] {
  return model.groups.map((group) => group.name)
}

function eventsOf(model: BoardModel, groupName: string) {
  const group = model.groups.find((candidate) => candidate.name === groupName)
  return model.events.filter((event) => event.groupId === group?.id)
}

describe('single-group report (RBL.pdf)', () => {
  test('reads the header, the group and every event', async () => {
    const model = await parse('RBL.pdf')

    expect(model.property).toBe('COLUMBUS HR')
    expect(model.dateText).toBe('Sunday, September 6, 2026')
    expect(groupNames(model)).toEqual(['MATSURICON CYBERPUNK CITY 2026'])
    expect(model.events).toHaveLength(22)

    expect(model.events[0]).toMatchObject({
      start: '06:00 AM',
      end: '04:00 PM',
      title: 'Public Safety',
      room: 'CLARK',
      hidden: false,
    })
    expect(model.events.at(-1)).toMatchObject({
      start: '12:00 PM',
      end: '04:00 PM',
      title: 'Charity',
      room: 'KNOX',
    })
  })

  test('keeps ampersands and slashes in titles and rooms', async () => {
    const model = await parse('RBL.pdf')
    const titles = model.events.map((event) => event.title)
    expect(titles).toContain('Story Tellers & RPG')
    expect(model.events.map((event) => event.room)).toContain('GRANT / HARDING')
    expect(model.events.map((event) => event.room)).toContain('PRIVATE DINING ROOM')
  })

  test('reports no warnings for a clean report', async () => {
    const model = await parse('RBL.pdf')
    expect(model.warnings).toEqual([])
  })
})

describe('multi-group report (RBL large example.pdf)', () => {
  test('reads all five groups across both pages', async () => {
    const model = await parse('RBL-large-example.pdf')

    expect(model.property).toBe('COLUMBUS HR')
    expect(model.dateText).toBe('Friday, August 14, 2026')
    expect(groupNames(model)).toEqual([
      'GT Law Meeting',
      'Gamma Iota Sigma 2026 Leadership Symposium',
      'JW Hammer',
      'NAIC 2026 Summer National Meeting',
      'NAMIC Meetings',
    ])
    expect(model.events).toHaveLength(23)
  })

  test('a group keeps running across a page break', async () => {
    const model = await parse('RBL-large-example.pdf')
    // 12 sessions on page 1 plus the three 01:00 PM sessions on page 2.
    const gamma = eventsOf(model, 'Gamma Iota Sigma 2026 Leadership Symposium')
    expect(gamma).toHaveLength(15)
    expect(gamma.at(-1)).toMatchObject({
      start: '01:00 PM',
      end: '01:45 PM',
      title: 'Session 3 - Student Session',
      room: 'DELAWARE D',
    })
  })

  test('joins titles that wrap onto two or three lines', async () => {
    const model = await parse('RBL-large-example.pdf')
    const titles = model.events.map((event) => event.title)
    expect(titles).toContain('Session 3 - Everyday Inclusion: Creating Environments of Belonging')
    expect(titles).toContain('Session 2 - Leading the Pathway to Wellness')
    expect(titles).toContain('Faegre Drinker Biddle & Reath, LLP')
    expect(titles).toContain('Student Advisory Council Training')
  })

  test('does not mistake the repeated page header for a group', async () => {
    const model = await parse('RBL-large-example.pdf')
    expect(groupNames(model)).not.toContain('COLUMBUS HR')
    expect(groupNames(model)).not.toContain('Friday, August 14, 2026')
  })
})

describe('line classifiers', () => {
  test('recognises RBL time ranges', () => {
    expect(isTimeRange('06:00 AM - 04:00 PM')).toBe(true)
    expect(isTimeRange('9:40 AM - 10:25 AM')).toBe(true)
    expect(isTimeRange('Coffee Break')).toBe(false)
  })

  test('recognises the report date line', () => {
    expect(isDateLine('Sunday, September 6, 2026')).toBe(true)
    expect(isDateLine('NAMIC Meetings')).toBe(false)
    expect(isDateLine('GT Law Meeting')).toBe(false)
  })
})
