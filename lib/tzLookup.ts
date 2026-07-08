/**
 * Lookup automat de timezone din locație [C §6.3.1 — Master Tour face
 * lookup din city/state/country].
 *
 * [D→N] Implementare MVP izolată aici: heuristică țară→tz pentru țările cu
 * un singur fus (acoperă piața RO/CEE); fallback: userul alege din lista
 * IANA. Faza 2 poate înlocui cu Google Time Zone API pe lat/lng fără să
 * schimbe apelanții.
 */

const COUNTRY_TZ: Record<string, string> = {
  // RO/CEE + Europa de turneu (chei normalizate lowercase, fără diacritice)
  romania: 'Europe/Bucharest',
  moldova: 'Europe/Chisinau',
  bulgaria: 'Europe/Sofia',
  hungary: 'Europe/Budapest',
  ungaria: 'Europe/Budapest',
  germany: 'Europe/Berlin',
  germania: 'Europe/Berlin',
  france: 'Europe/Paris',
  franta: 'Europe/Paris',
  spain: 'Europe/Madrid',
  spania: 'Europe/Madrid',
  italy: 'Europe/Rome',
  italia: 'Europe/Rome',
  netherlands: 'Europe/Amsterdam',
  olanda: 'Europe/Amsterdam',
  belgium: 'Europe/Brussels',
  belgia: 'Europe/Brussels',
  austria: 'Europe/Vienna',
  switzerland: 'Europe/Zurich',
  elvetia: 'Europe/Zurich',
  poland: 'Europe/Warsaw',
  polonia: 'Europe/Warsaw',
  czechia: 'Europe/Prague',
  cehia: 'Europe/Prague',
  slovakia: 'Europe/Bratislava',
  slovacia: 'Europe/Bratislava',
  serbia: 'Europe/Belgrade',
  croatia: 'Europe/Zagreb',
  croatia_hr: 'Europe/Zagreb',
  slovenia: 'Europe/Ljubljana',
  greece: 'Europe/Athens',
  grecia: 'Europe/Athens',
  turkey: 'Europe/Istanbul',
  turcia: 'Europe/Istanbul',
  uk: 'Europe/London',
  'united kingdom': 'Europe/London',
  'marea britanie': 'Europe/London',
  ireland: 'Europe/Dublin',
  irlanda: 'Europe/Dublin',
  portugal: 'Europe/Lisbon',
  portugalia: 'Europe/Lisbon',
  denmark: 'Europe/Copenhagen',
  danemarca: 'Europe/Copenhagen',
  sweden: 'Europe/Stockholm',
  suedia: 'Europe/Stockholm',
  norway: 'Europe/Oslo',
  norvegia: 'Europe/Oslo',
  finland: 'Europe/Helsinki',
  finlanda: 'Europe/Helsinki',
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Sugestia de timezone pentru o țară; null dacă nu știm sigur. */
export function suggestTimezone(country: string | null | undefined): string | null {
  if (!country) return null
  return COUNTRY_TZ[normalize(country)] ?? null
}

/** Lista completă IANA pentru dropdown-ul manual. */
export function allTimezones(): string[] {
  return Intl.supportedValuesOf('timeZone')
}

export const DEFAULT_TZ = 'Europe/Bucharest'
