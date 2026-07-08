/**
 * Generare ICS (blueprint §6.16 [C]) — două moduri:
 *  - summary: un VEVENT all-day per Tour Date, cu notes/venue/hotel în descriere
 *  - items:   câte un VEVENT pentru fiecare Schedule Item și Travel Item
 * Instantele sunt UTC (corecte peste DST — clientul convertește la afișare).
 */
import { dayInstant } from './datetime'

export interface IcsFeedDay {
  date: string // YYYY-MM-DD
  day_type: string
  city: string | null
  country: string | null
  timezone: string | null
  general_notes: string | null
  tour: string
  venues: string[]
  hotels: string[]
  schedule: { title: string; start_at: string | null; end_at: string | null }[]
  travel: {
    title: string | null
    depart_time: string | null
    arrive_time: string | null
    depart_day_offset: number
    arrive_day_offset: number
  }[]
}

/** Escaping RFC 5545: backslash, punct și virgulă, virgulă, newline. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Folding la 75 de octeți (RFC 5545 §3.1) — simplu, pe caractere. */
export function icsFold(line: string): string {
  if (line.length <= 73) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 73))
  rest = rest.slice(73)
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 72)}`)
    rest = rest.slice(72)
  }
  return parts.join('\r\n')
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function dateStamp(date: string): string {
  return date.replace(/-/g, '')
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function vevent(lines: string[]): string[] {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT']
}

export function buildIcs(
  mode: 'summary' | 'items',
  days: IcsFeedDay[],
  calendarName = 'TourApp',
): string {
  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TourApp//RO',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
  ]

  for (const day of days) {
    const tz = day.timezone ?? 'UTC'
    const location = [day.city, day.country].filter(Boolean).join(', ')

    if (mode === 'summary') {
      // [C] One Summary Per Day: item all-day cu detalii în descriere
      const description = [
        day.tour,
        day.day_type,
        day.venues.length ? `Venue: ${day.venues.join(', ')}` : null,
        day.hotels.length ? `Hotel: ${day.hotels.join(', ')}` : null,
        ...day.schedule
          .filter((s) => s.start_at)
          .map((s) => `${utcTime(s.start_at!, tz)} ${s.title}`),
        day.general_notes,
      ]
        .filter(Boolean)
        .join('\n')

      out.push(
        ...vevent([
          `UID:day-${day.date}-${icsEscape(day.tour).replace(/\W/g, '')}@tourapp`,
          `DTSTART;VALUE=DATE:${dateStamp(day.date)}`,
          `DTEND;VALUE=DATE:${dateStamp(addDaysIso(day.date, 1))}`,
          icsFold(`SUMMARY:${icsEscape(`${day.tour} — ${location || day.day_type}`)}`),
          icsFold(`DESCRIPTION:${icsEscape(description)}`),
          location ? `LOCATION:${icsEscape(location)}` : '',
        ].filter(Boolean)),
      )
    } else {
      // [C] Individual Schedule Items + Travel Items
      let counter = 0
      for (const item of day.schedule) {
        if (!item.start_at) continue
        counter += 1
        out.push(
          ...vevent([
            `UID:si-${day.date}-${counter}@tourapp`,
            `DTSTART:${utcStamp(item.start_at)}`,
            item.end_at ? `DTEND:${utcStamp(item.end_at)}` : '',
            icsFold(`SUMMARY:${icsEscape(item.title)}`),
            location ? `LOCATION:${icsEscape(location)}` : '',
          ].filter(Boolean)),
        )
      }
      for (const item of day.travel) {
        if (!item.depart_time) continue
        counter += 1
        const start = dayInstant(
          addDaysIso(day.date, item.depart_day_offset),
          item.depart_time.slice(0, 5),
          tz,
        )
        const end = item.arrive_time
          ? dayInstant(
              addDaysIso(day.date, item.arrive_day_offset),
              item.arrive_time.slice(0, 5),
              tz,
            )
          : null
        out.push(
          ...vevent([
            `UID:tr-${day.date}-${counter}@tourapp`,
            `DTSTART:${utcStamp(start.toISOString())}`,
            end ? `DTEND:${utcStamp(end.toISOString())}` : '',
            icsFold(`SUMMARY:${icsEscape(item.title ?? 'Travel')}`),
          ].filter(Boolean)),
        )
      }
    }
  }

  out.push('END:VCALENDAR')
  return out.join('\r\n') + '\r\n'
}

function utcTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}
