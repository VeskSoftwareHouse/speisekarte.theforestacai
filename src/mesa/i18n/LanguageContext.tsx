import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_LANGUAGE, type LanguageCode } from './languages'
import { STRINGS, type StringKey } from './strings'

const STORAGE_KEY = 'cardapio:lang'

type SwapPhase = 'idle' | 'erasing' | 'writing'

// Precisam bater com as durações de .lang-erasing / .lang-writing no mesa.css.
const ERASE_MS = 260
const WRITE_MS = 340
const MAX_STAGGER_MS = 120

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
  // 'erasing' -> troca o idioma -> 'writing'. A troca acontece com o texto já
  // varrido da tela, então ninguém vê as duas línguas ao mesmo tempo.
  const [phase, setPhase] = useState<SwapPhase>('idle')
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  // useLayoutEffect, e não useEffect: a classe precisa entrar antes da pintura.
  // Depois do quadro, haveria um piscar com o texto novo já visível e sem corte,
  // logo antes da varredura de escrita começar.
  useLayoutEffect(() => {
    if (phase === 'idle') return
    const cls = `lang-${phase}`
    document.body.classList.add(cls)
    return () => document.body.classList.remove(cls)
  }, [phase])

  // A volta ao repouso só é agendada depois que 'writing' virou render de
  // verdade. Agendada junto com a de apagar, os dois disparos podiam cair no
  // mesmo tique — em aba de segundo plano, com os temporizadores estrangulados,
  // é o que acontece — e o React fundia as duas fases num render só, engolindo a
  // varredura de escrita inteira.
  useEffect(() => {
    if (phase !== 'writing') return
    const id = window.setTimeout(() => setPhase('idle'), WRITE_MS + MAX_STAGGER_MS)
    timers.current.push(id)
    return () => window.clearTimeout(id)
  }, [phase])

  function setLang(l: LanguageCode) {
    if (l === lang) return
    localStorage.setItem(STORAGE_KEY, l)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLangState(l)
      return
    }

    timers.current.forEach(window.clearTimeout)
    setPhase('erasing')
    timers.current = [
      window.setTimeout(() => {
        setLangState(l)
        setPhase('writing')
      }, ERASE_MS),
    ]
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
