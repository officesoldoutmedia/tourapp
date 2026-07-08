import { describe, expect, it } from 'vitest'
import {
  dayInstant,
  scheduleInterval,
  formatTimeInZone,
  formatDayHeader,
  isDstTransitionDay,
  zoneAbbreviation,
} from './datetime'

describe('dayInstant — ora locală a zilei → instant UTC', () => {
  it('vara (EEST, UTC+3)', () => {
    expect(dayInstant('2026-07-17', '12:00', 'Europe/Bucharest').toISOString()).toBe(
      '2026-07-17T09:00:00.000Z',
    )
  })
  it('iarna (EET, UTC+2)', () => {
    expect(dayInstant('2026-01-15', '12:00', 'Europe/Bucharest').toISOString()).toBe(
      '2026-01-15T10:00:00.000Z',
    )
  })
  it('ziua trecerii la ora de vară (2026-03-29): 12:00 e deja EEST', () => {
    expect(dayInstant('2026-03-29', '12:00', 'Europe/Bucharest').toISOString()).toBe(
      '2026-03-29T09:00:00.000Z',
    )
  })
  it('alt fus: America/New_York (EDT, UTC-4)', () => {
    expect(dayInstant('2026-07-17', '12:00', 'America/New_York').toISOString()).toBe(
      '2026-07-17T16:00:00.000Z',
    )
  })
})

describe('scheduleInterval — logica +1 peste miezul nopții [C §6.4]', () => {
  it('interval normal în aceeași zi', () => {
    const r = scheduleInterval({
      date: '2026-07-17',
      tz: 'Europe/Bucharest',
      start: '10:00',
      end: '12:00',
    })
    expect(r.plusOne).toBe(false)
    expect(r.startAt.toISOString()).toBe('2026-07-17T07:00:00.000Z')
    expect(r.endAt!.toISOString()).toBe('2026-07-17T09:00:00.000Z')
  })
  it('end ≤ start pe ceas → end e a doua zi (+1)', () => {
    const r = scheduleInterval({
      date: '2026-07-17',
      tz: 'Europe/Bucharest',
      start: '23:00',
      end: '02:00',
    })
    expect(r.plusOne).toBe(true)
    expect(r.startAt.toISOString()).toBe('2026-07-17T20:00:00.000Z')
    expect(r.endAt!.toISOString()).toBe('2026-07-17T23:00:00.000Z') // 02:00 pe 18 iul EEST
  })
  it('end egal cu start → tratat +1 (24h)', () => {
    const r = scheduleInterval({
      date: '2026-07-17',
      tz: 'Europe/Bucharest',
      start: '20:00',
      end: '20:00',
    })
    expect(r.plusOne).toBe(true)
  })
  it('+1 peste tranziția DST de toamnă (25 oct 2026, ceasul dă înapoi)', () => {
    const r = scheduleInterval({
      date: '2026-10-24',
      tz: 'Europe/Bucharest',
      start: '23:00',
      end: '05:00',
    })
    // 23:00 EEST pe 24 oct = 20:00Z; 05:00 pe 25 oct e EET (UTC+2) = 03:00Z
    expect(r.plusOne).toBe(true)
    expect(r.startAt.toISOString()).toBe('2026-10-24T20:00:00.000Z')
    expect(r.endAt!.toISOString()).toBe('2026-10-25T03:00:00.000Z')
    // durata reală: 8h (nu 6h) — noaptea DST are o oră în plus
  })
  it('fără end', () => {
    const r = scheduleInterval({
      date: '2026-07-17',
      tz: 'Europe/Bucharest',
      start: '10:00',
      end: null,
    })
    expect(r.endAt).toBeNull()
    expect(r.plusOne).toBe(false)
  })
})

describe('formatare în timezone-ul ZILEI, nu al device-ului (§11.5)', () => {
  const instant = new Date('2026-07-17T20:00:00.000Z')
  it('formatTimeInZone', () => {
    expect(formatTimeInZone(instant, 'Europe/Bucharest')).toBe('23:00')
    expect(formatTimeInZone(instant, 'America/New_York')).toBe('16:00')
  })
  it('formatDayHeader (en) conține ziua săptămânii + abrevierea tz [A.2]', () => {
    const h = formatDayHeader('2026-07-17', 'Europe/Bucharest', 'en')
    expect(h).toContain('Friday')
    expect(h).toContain('17')
    expect(h).toContain('July')
    expect(h).toContain('2026')
  })
  it('formatDayHeader (ro)', () => {
    const h = formatDayHeader('2026-07-17', 'Europe/Bucharest', 'ro')
    expect(h.toLowerCase()).toContain('vineri')
  })
  it('zoneAbbreviation (ICU dă abrevierea sau offsetul GMT — ambele OK)', () => {
    expect(zoneAbbreviation('2026-07-17', 'Europe/Bucharest')).toMatch(
      /^(EEST|GMT\+3)$/,
    )
    expect(zoneAbbreviation('2026-01-15', 'Europe/Bucharest')).toMatch(
      /^(EET|GMT\+2)$/,
    )
    // fusurile americane au abrevieri CLDR reale
    expect(zoneAbbreviation('2026-07-17', 'America/New_York')).toBe('EDT')
  })
})

describe('isDstTransitionDay — zile cu schimbare de oră [C §6.3.1]', () => {
  it('29 mar 2026 (primăvară) și 25 oct 2026 (toamnă) în RO', () => {
    expect(isDstTransitionDay('2026-03-29', 'Europe/Bucharest')).toBe(true)
    expect(isDstTransitionDay('2026-10-25', 'Europe/Bucharest')).toBe(true)
  })
  it('zi normală → false', () => {
    expect(isDstTransitionDay('2026-07-17', 'Europe/Bucharest')).toBe(false)
  })
  it('fus fără DST → mereu false', () => {
    expect(isDstTransitionDay('2026-03-29', 'Asia/Dubai')).toBe(false)
  })
})
