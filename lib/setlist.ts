/**
 * Set list (blueprint §6.10) — totalurile din footer [C-S]:
 * "N song, N break, MM:SS" (durata totală, calculată live).
 */

export interface SetListTotalsInput {
  item_type: 'song' | 'break'
  length_seconds: number | null
}

export interface SetListTotals {
  songs: number
  breaks: number
  totalSeconds: number
}

export function setListTotals(items: SetListTotalsInput[]): SetListTotals {
  return items.reduce<SetListTotals>(
    (acc, item) => ({
      songs: acc.songs + (item.item_type === 'song' ? 1 : 0),
      breaks: acc.breaks + (item.item_type === 'break' ? 1 : 0),
      totalSeconds: acc.totalSeconds + (item.length_seconds ?? 0),
    }),
    { songs: 0, breaks: 0, totalSeconds: 0 },
  )
}

/** 250 → "4:10"; 3660 → "61:00" (minute totale, ca la ei). */
export function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Parsează "4:10" → 250; "250" → 250; invalid → null. */
export function parseMmSs(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^(\d+):([0-5]?\d)$/)
  if (match) return Number(match[1]) * 60 + Number(match[2])
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  return null
}
