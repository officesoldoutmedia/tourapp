import { getRequestConfig } from 'next-intl/server'

// English-only (decizie 2026-08-09); contractele C3 rămân RO prin propriile
// texte, nu prin next-intl.
export const LOCALES = ['en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  messages: (await import('../messages/en.json')).default,
}))
