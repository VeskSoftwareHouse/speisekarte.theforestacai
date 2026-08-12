export type LanguageCode = 'de' | 'fr' | 'it' | 'en' | 'pt' | 'es'

export interface LanguageInfo {
  code: LanguageCode
  label: string
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'de'
