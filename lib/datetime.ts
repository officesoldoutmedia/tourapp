/**
 * Utilitare timezone-aware (blueprint §11.5 — timezone discipline).
 *
 * REGULA: toate timestamp-urile sunt UTC în DB; TOATE afișările se fac în
 * timezone-ul ZILEI (days.timezone), nu al device-ului. Interzis
 * `new Date().toLocaleString()` direct în componente — folosește funcțiile
 * de aici.
 */
import { fromZonedTime } from 'date-fns-tz'
import { addDays, format, parseISO } from 'date-fns'

export type ISODate = string // 'YYYY-MM-DD'
export type ClockTime = string // 'HH:mm'

/** Instantul UTC al orei locale `time` din ziua `date` în fusul `tz`. */
export function dayInstant(date: ISODate, time: ClockTime, tz: string): Date {
  return fromZonedTime(`${date}T${time}:00`, tz)
}

export interface ScheduleIntervalInput {
  date: ISODate
  tz: string
  start: ClockTime
  end: ClockTime | null
}

export interface ScheduleIntervalResult {
  startAt: Date
  endAt: Date | null
  /** [C §6.4] end ≤ start pe ceas ⇒ end-ul e în ziua următoare ("+1"). */
  plusOne: boolean
}

/** Construiește intervalul UTC al unui schedule item, cu logica +1. */
export function scheduleInterval(
  input: ScheduleIntervalInput,
): ScheduleIntervalResult {
  const startAt = dayInstant(input.date, input.start, input.tz)
  if (!input.end) return { startAt, endAt: null, plusOne: false }

  const plusOne = input.end <= input.start // comparație lexicografică HH:mm
  const endDate = plusOne
    ? format(addDays(parseISO(input.date), 1), 'yyyy-MM-dd')
    : input.date
  const endAt = dayInstant(endDate, input.end, input.tz)
  return { startAt, endAt, plusOne }
}

/** Detectează +1 pentru afișare, din instantele stocate. */
export function isPlusOne(startAt: Date, endAt: Date, tz: string): boolean {
  return dayKeyInZone(startAt, tz) !== dayKeyInZone(endAt, tz)
}

function dayKeyInZone(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** 'HH:mm' în fusul dat (24h). */
export function formatTimeInZone(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}

/** Abrevierea fusului la prânzul zilei date (ex. 'EEST'). */
export function zoneAbbreviation(date: ISODate, tz: string): string {
  const instant = dayInstant(date, '12:00', tz)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'short',
  }).formatToParts(instant)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}

/**
 * Header-ul zilei [A.2]: "Friday, 17 July 2026 EEST" / "vineri, 17 iulie
 * 2026 EEST".
 */
export function formatDayHeader(
  date: ISODate,
  tz: string,
  locale: string,
): string {
  const instant = dayInstant(date, '12:00', tz)
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant)
  return `${formatted} ${zoneAbbreviation(date, tz)}`
}

function offsetMinutesAt(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  }).formatToParts(instant)
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = raw.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3]))
}

/**
 * [C §6.3.1] Pe zilele cu schimbare de oră se afișează ambele timezone-uri.
 * true dacă offsetul UTC diferă între începutul și sfârșitul zilei.
 */
export function isDstTransitionDay(date: ISODate, tz: string): boolean {
  const startOfDay = dayInstant(date, '00:00', tz)
  const nextDate = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
  const endOfDay = dayInstant(nextDate, '00:00', tz)
  return offsetMinutesAt(startOfDay, tz) !== offsetMinutesAt(endOfDay, tz)
}
