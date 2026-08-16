import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import AnimatedLogo from './AnimatedLogo'

/** Tempo parado até a mesa virar vitrine. */
export const IDLE_MS = 90_000
/** Tempo de descanso até dar o pedido por abandonado. */
export const ABANDONED_MS = 180_000

// Qualquer um destes conta como "tem gente aqui". Em capture para valer mesmo
// que algum componente interrompa a propagação do evento.
const ACTIVITY = ['pointerdown', 'pointermove', 'click', 'keydown', 'wheel', 'touchstart'] as const

interface Props {
  /** Falso durante o pagamento, onde cobrir a tela seria péssimo. */
  enabled: boolean
  /** Chamado quando o descanso já dura ABANDONED_MS: a mesa está livre. */
  onAbandoned: () => void
}

export default function Screensaver({ enabled, onAbandoned }: Props) {
  const { t } = useLanguage()
  const [idle, setIdle] = useState(false)
  const timer = useRef<number>()

  // Guardado numa ref para o efeito abaixo depender só de `idle`. Recebendo a
  // função direto, qualquer re-render do App recriaria a callback e reiniciaria
  // a contagem dos 3 minutos, que então nunca chegaria ao fim.
  const abandoned = useRef(onAbandoned)
  useEffect(() => {
    abandoned.current = onAbandoned
  })

  useEffect(() => {
    if (!idle) return
    const id = window.setTimeout(() => abandoned.current(), ABANDONED_MS)
    return () => window.clearTimeout(id)
  }, [idle])

  useEffect(() => {
    if (!enabled) {
      setIdle(false)
      return
    }

    const arm = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setIdle(true), IDLE_MS)
    }
    const wake = () => {
      setIdle(false)
      arm()
    }

    arm()
    for (const evt of ACTIVITY) {
      window.addEventListener(evt, wake, { passive: true, capture: true })
    }
    return () => {
      window.clearTimeout(timer.current)
      for (const evt of ACTIVITY) {
        window.removeEventListener(evt, wake, { capture: true })
      }
    }
  }, [enabled])

  if (!enabled || !idle) return null

  return (
    // O toque que acorda a tela morre aqui: sem isso ele atravessaria e o
    // cliente adicionaria um produto sem querer só por encostar para começar.
    <div
      className="screensaver"
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setIdle(false)
      }}
      role="presentation"
    >
      <div className="screensaver__logo">
        <AnimatedLogo interactive={false} />
      </div>
      <p className="screensaver__hint">{t('screensaverHint')}</p>
    </div>
  )
}
