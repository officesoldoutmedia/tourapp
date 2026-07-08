import { describe, expect, it } from 'vitest'
import { buildIcs, icsEscape, icsFold, type IcsFeedDay } from './ics'

const day: IcsFeedDay = {
  date: '2026-10-25', // ziua tranziției DST în RO
  day_type: 'show',
  city: 'Cluj',
  country: 'România',
  timezone: 'Europe/Bucharest',
  general_notes: 'Note; cu, virgule\nși newline',
  tour: 'SxS Summer 2026',
  venues: ['NIBIRU'],
  hotels: ['Hotel Beta'],
  schedule: [
    {
      title: 'Load-in',
      // 02:30 EEST (înainte de tranziție) = 23:30Z pe 24
      start_at: '2026-10-24T23:30:00.000Z',
      end_at: '2026-10-25T01:30:00.000Z',
    },
  ],
  travel: [
    {
      title: 'Drive To Cluj-Napoca',
      depart_time: '05:00:00', // DUPĂ tranziție: 05:00 EET = 03:00Z
      arrive_time: '08:00:00',
      depart_day_offset: 0,
      arrive_day_offset: 0,
    },
  ],
}

describe('icsEscape / icsFold (RFC 5545)', () => {
  it('escapează ; , \\ și newline', () => {
    expect(icsEscape('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
  })
  it('fold la 75 octeți cu spațiu de continuare', () => {
    const folded = icsFold('SUMMARY:' + 'x'.repeat(100))
    const lines = folded.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[1].startsWith(' ')).toBe(true)
    expect(lines.every((l) => l.length <= 73)).toBe(true)
  })
})

describe('buildIcs — summary mode [C]', () => {
  const ics = buildIcs('summary', [day])
  it('structură validă', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
  })
  it('un singur VEVENT all-day per zi, cu venue/hotel în descriere', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261025')
    expect(ics).toContain('DTEND;VALUE=DATE:20261026')
    expect(ics).toContain('Venue: NIBIRU')
    expect(ics).toContain('Hotel: Hotel Beta')
  })
})

describe('buildIcs — items mode [C], corect peste DST', () => {
  const ics = buildIcs('items', [day])
  it('VEVENT per schedule item + travel item', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })
  it('schedule item: instantele UTC stocate trec direct', () => {
    expect(ics).toContain('DTSTART:20261024T233000Z')
    expect(ics).toContain('DTEND:20261025T013000Z')
  })
  it('travel: 05:00 local pe 25 oct = 03:00Z (EET, după tranziție) — DoD', () => {
    expect(ics).toContain('DTSTART:20261025T030000Z')
    expect(ics).toContain('DTEND:20261025T060000Z')
  })
})
