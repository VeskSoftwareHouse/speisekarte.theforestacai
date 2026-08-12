import { createContext, useContext, useState, type ReactNode } from 'react'
import { DEFAULT_LANGUAGE, type LanguageCode } from './languages'
import { STRINGS, type StringKey } from './strings'

const STORAGE_KEY = 'cardapio:lang'

interface LanguageContextValue {
  lang: LanguageCode
  setLang: (l: LanguageCode) => void
  t: (key: StringKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredLanguage(): LanguageCode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved && saved in STRINGS ? (saved as LanguageCode) : DEFAULT_LANGUAGE
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(readStoredLanguage)

  function setLang(l: LanguageCode) {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  function t(key: StringKey, vars?: Record<string, string | number>): string {
    let text = STRINGS[lang][key] ?? STRINGS[DEFAULT_LANGUAGE][key]
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replace(`{${name}}`, String(value))
      }
    }
    return text
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage deve ser usado dentro de um LanguageProvider')
  return ctx
}
