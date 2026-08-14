export type LanguageCode = 'de' | 'fr' | 'it' | 'en' | 'pt' | 'es'

export interface LanguageInfo {
  code: LanguageCode
  label: string
  flag: string
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'de', label: 'Deutsch', flag: '/bandeiras/alemanha.png' },
  { code: 'fr', label: 'Français', flag: '/bandeiras/franca.png' },
  { code: 'it', label: 'Italiano', flag: '/bandeiras/italia.png' },
  { code: 'en', label: 'English', flag: '/bandeiras/reino-unido.png' },
  { code: 'pt', label: 'Português', flag: '/bandeiras/brasil.png' },
  { code: 'es', label: 'Español', flag: '/bandeiras/espanha.png' },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'de'
