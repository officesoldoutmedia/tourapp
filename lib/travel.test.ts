import { describe, expect, it } from 'vitest'
import { travelAutoTitle, formatDuration, arrivalFrom } from './travel'

describe('travelAutoTitle [C-S §3.7]', () => {
  it('ground: "Drive To X — distanță / durată"', () => {
    expect(
      travelAutoTitle({
        travel_type: 'ground',
        dest_label: 'Cluj-Napoca',
        distance: 189,
        distance_unit: 'kilometers',
        duration_min: 180,
      }),
    ).toBe('Drive To Cluj-Napoca - 189 Kilometers / 3 hours 0 mins')
  })
  it('ground în mile', () => {
    expect(
      travelAutoTitle({
        travel_type: 'ground',
        dest_label: 'X',
        distance: 240,
        distance_unit: 'miles',
        duration_min: 201,
      }),
    ).toBe('Drive To X - 240 Miles / 3 hours 21 mins')
  })
  it('sea: "Sail to X"', () => {
    expect(
      travelAutoTitle({
        travel_type: 'sea',
        dest_label: 'Thassos',
        distance: 12,
        distance_unit: 'kilometers',
        duration_min: 45,
      }),
    ).toBe('Sail to Thassos - 12 Kilometers / 45 mins')
  })
  it('rail: "Dep X Arr Y"', () => {
    expect(
      travelAutoTitle({
        travel_type: 'rail',
        origin_label: 'București Nord',
        dest_label: 'Brașov',
      }),
    ).toBe('Dep București Nord Arr Brașov')
  })
  it('air: "Fly" (+ destinație dacă există)', () => {
    expect(travelAutoTitle({ travel_type: 'air' })).toBe('Fly')
    expect(travelAutoTitle({ travel_type: 'air', dest_label: 'OTP' })).toBe(
      'Fly to OTP',
    )
  })
  it('ground fără calc încă → doar destinația', () => {
    expect(
      travelAutoTitle({ travel_type: 'ground', dest_label: 'Sibiu' }),
    ).toBe('Drive To Sibiu')
  })
})

describe('formatDuration', () => {
  it('sub o oră', () => expect(formatDuration(45)).toBe('45 mins'))
  it('ore + minute', () => expect(formatDuration(201)).toBe('3 hours 21 mins'))
  it('exact o oră', () => expect(formatDuration(60)).toBe('1 hour 0 mins'))
})

describe('arrivalFrom — ora de sosire din plecare + durată, în tz-ul zilei', () => {
  it('simplu, aceeași zi', () => {
    const r = arrivalFrom('2026-07-19', '10:00', 180, 'Europe/Bucharest')
    expect(r).toEqual({ time: '13:00', dayOffset: 0 })
  })
  it('peste miezul nopții → dayOffset 1', () => {
    const r = arrivalFrom('2026-07-19', '23:30', 90, 'Europe/Bucharest')
    expect(r).toEqual({ time: '01:00', dayOffset: 1 })
  })
  it('peste tranziția DST de toamnă (25 oct 2026)', () => {
    // plecare 02:00 EEST; +120 min reali → 03:00 EET (ceasul a dat înapoi)
    const r = arrivalFrom('2026-10-25', '02:00', 120, 'Europe/Bucharest')
    expect(r).toEqual({ time: '03:00', dayOffset: 0 })
  })
})
