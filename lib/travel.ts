/**
 * Logica de travel (blueprint §6.7) — funcții PURE (auto-title, sosire).
 * Apelurile Google (Distance Matrix / Time Zone) stau în lib/googlePlaces.ts
 * (server-only); aici nu importăm nimic server-side ca să fie testabil.
 */
import { dayInstant, formatTimeInZone, type ISODate } from './datetime'

export interface AutoTitleInput {
  travel_type: 'ground' | 'air' | 'rail' | 'sea'
  origin_label?: string | null
  dest_label?: string | null
  distance?: number | null
  distance_unit?: string | null
  duration_min?: number | null
}

export function formatDuration(totalMin: number): string {
  if (totalMin < 60) return `${totalMin} mins`
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${mins} mins`
}

function distancePart(input: AutoTitleInput): string {
  if (input.distance == null || input.duration_min == null) return ''
  const unit = input.distance_unit === 'miles' ? 'Miles' : 'Kilometers'
  return ` - ${input.distance} ${unit} / ${formatDuration(input.duration_min)}`
}

/**
 * [C-S §3.7] Titlul automat per tip:
 *   ground → "Drive To X - 240 Kilometers / 3 hours 21 mins"
 *   sea    → "Sail to X - …"
 *   rail   → "Dep X Arr Y"
 *   air    → "Fly" / "Fly to X"
 */
export function travelAutoTitle(input: AutoTitleInput): string {
  switch (input.travel_type) {
    case 'ground':
      return `Drive To ${input.dest_label ?? ''}${distancePart(input)}`.trim()
    case 'sea':
      return `Sail to ${input.dest_label ?? ''}${distancePart(input)}`.trim()
    case 'rail':
      return `Dep ${input.origin_label ?? ''} Arr ${input.dest_label ?? ''}`.trim()
    case 'air':
      return input.dest_label ? `Fly to ${input.dest_label}` : 'Fly'
  }
}

function dayKeyInZone(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/**
 * [C §6.7] Auto-calc Arrival Time: plecare (ora locală a zilei) + durată
 * reală → ora locală de sosire + day offset (DAYOF/DAYAFTER), corect
 * peste DST (calcul pe instante UTC, afișare în tz).
 */
export function arrivalFrom(
  date: ISODate,
  departTime: string,
  durationMin: number,
  tz: string,
): { time: string; dayOffset: number } {
  const departAt = dayInstant(date, departTime, tz)
  const arriveAt = new Date(departAt.getTime() + durationMin * 60_000)
  const startKey = dayKeyInZone(departAt, tz)
  const endKey = dayKeyInZone(arriveAt, tz)
  const dayOffset = Math.round(
    (Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) /
      86_400_000,
  )
  return { time: formatTimeInZone(arriveAt, tz), dayOffset }
}
