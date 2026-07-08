import { describe, expect, it } from 'vitest'
import { formatMmSs, parseMmSs, setListTotals } from './setlist'

describe('setListTotals [C-S §6.10] — "N song, N break, MM:SS"', () => {
  it('numără piese, breaks și durata', () => {
    expect(
      setListTotals([
        { item_type: 'song', length_seconds: 240 },
        { item_type: 'song', length_seconds: 250 },
        { item_type: 'break', length_seconds: null },
        { item_type: 'song', length_seconds: null }, // piesă fără durată setată
      ]),
    ).toEqual({ songs: 3, breaks: 1, totalSeconds: 490 })
  })
  it('gol', () => {
    expect(setListTotals([])).toEqual({ songs: 0, breaks: 0, totalSeconds: 0 })
  })
})

describe('formatMmSs / parseMmSs', () => {
  it('format', () => {
    expect(formatMmSs(250)).toBe('4:10')
    expect(formatMmSs(3660)).toBe('61:00')
    expect(formatMmSs(0)).toBe('0:00')
  })
  it('parse round-trip', () => {
    expect(parseMmSs('4:10')).toBe(250)
    expect(parseMmSs('250')).toBe(250)
    expect(parseMmSs('4:70')).toBeNull()
    expect(parseMmSs('')).toBeNull()
  })
})
