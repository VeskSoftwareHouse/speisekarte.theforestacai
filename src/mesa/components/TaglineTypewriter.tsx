import { useEffect, useMemo, useState } from 'react'
import { LANGUAGES, type LanguageCode } from '../i18n/languages'
import { STRINGS } from '../i18n/strings'
import { useLanguage } from '../i18n/LanguageContext'

interface Face {
  family: string
  weight: number
  size: string
  style?: 'italic'
  spacing?: string
}

// Cada idioma escreve com a própria fonte. As famílias estão carregadas em
// mesa/index.html. O tamanho é ajustado uma a uma porque as alturas de x são
// bem diferentes — a Caveat precisa de bem mais corpo que a Space Mono para
// as duas parecerem do mesmo tamanho.
const FACES: Record<LanguageCode, Face> = {
  de: { family: "'Bricolage Grotesque', sans-serif", weight: 700, size: '0.86rem' },
  fr: { family: "'Playfair Display', serif", weight: 500, size: '0.95rem', style: 'italic' },
  it: { family: "'Caveat', cursive", weight: 700, size: '1.1rem' },
  en: { family: "'Space Mono', monospace", weight: 400, size: '0.78rem', spacing: '-0.02em' },
  pt: { family: "'Plus Jakarta Sans', sans-serif", weight: 600, size: '0.86rem' },
  es: { family: "'Fredoka', sans-serif", weight: 500, size: '0.9rem' },
}

const TYPE_MS = 55
const ERASE_MS = 26
const HOLD_MS = 2200 // tempo de leitura antes de apagar
const GAP_MS = 380 // respiro com a linha vazia entre um idioma e o outro

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function TaglineTypewriter() {
  const { t } = useLanguage()
  const phrases = useMemo(
    () => LANGUAGES.map((l) => ({ code: l.code, text: STRINGS[l.code].sidebarTagline })),
    [],
  )

  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Abaixo de 900px o CSS esconde a frase; sem esta guarda o cronômetro
  // continuaria redesenhando o componente a cada 55ms no celular, à toa.
  const visible = useMediaQuery('(min-width: 901px)')
  const animate = visible && !reduced

  const [index, setIndex] = useState(0)
  const [chars, setChars] = useState(0)
  const [erasing, setErasing] = useState(false)

  // O navegador só baixa uma fonte quando ela aparece na tela. Sem este empurrão
  // a Caveat chegaria no meio da frase em italiano e as letras já escritas
  // trocariam de forma na cara do cliente.
  useEffect(() => {
    if (!animate || !document.fonts) return
    for (const face of Object.values(FACES)) {
      document.fonts.load(`${face.style ?? 'normal'} ${face.weight} 1rem ${face.family}`).catch(() => {})
    }
  }, [animate])

  useEffect(() => {
    if (!animate) return
    const text = phrases[index].text
    let ms: number
    let next: () => void

    if (!erasing) {
      if (chars < text.length) {
        ms = TYPE_MS
        next = () => setChars(chars + 1)
      } else {
        ms = HOLD_MS
        next = () => setErasing(true)
      }
    } else if (chars > 0) {
      ms = ERASE_MS
      next = () => setChars(chars - 1)
    } else {
      ms = GAP_MS
      next = () => {
        setIndex((v) => (v + 1) % phrases.length)
        setErasing(false)
      }
    }

    const id = window.setTimeout(next, ms)
    return () => window.clearTimeout(id)
  }, [animate, chars, erasing, index, phrases])

  // Parado, a frase volta a ser simplesmente a do idioma escolhido.
  if (!animate) return <p className="sidebar__logo-tag">{t('sidebarTagline')}</p>

  const { code, text } = phrases[index]
  const face = FACES[code]

  return (
    <p className="sidebar__logo-tag">
      <span
        className="sidebar__logo-tag-text"
        lang={code}
        aria-hidden
        style={{
          fontFamily: face.family,
          fontWeight: face.weight,
          fontSize: face.size,
          fontStyle: face.style,
          letterSpacing: face.spacing,
        }}
      >
        {text.slice(0, chars)}
      </span>
      {/* Leitores de tela recebem a frase inteira e estável, no idioma
          escolhido — o vaivém de letras não faz sentido em voz. */}
      <span className="visually-hidden">{t('sidebarTagline')}</span>
    </p>
  )
}
