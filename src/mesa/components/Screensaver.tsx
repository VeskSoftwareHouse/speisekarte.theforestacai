import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import AnimatedLogo from './AnimatedLogo'

/** Tempo parado até a mesa virar vitrine. */
export const IDLE_MS = 90_000
/** Tempo de descanso até dar o pedido por abandonado. */
export const ABANDONED_MS = 180_000
/** Duração da saída. Precisa bater com .screensaver--leaving no mesa.css. */
const LEAVE_MS = 380

/** 'leaving' é a tela ainda montada, se apagando por cima do cardápio. */
type Phase = 'off' | 'on' | 'leaving'

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
  const [phase, setPhase] = useState<Phase>('off')
  const timer = useRef<number>()

  // Guardado numa ref para o efeito abaixo depender só da fase. Recebendo a
  // função direto, qualquer re-render do App recriaria a callback e reiniciaria
  // a contagem dos 3 minutos, que então nunca chegaria ao fim.
  const abandoned = useRef(onAbandoned)
  useEffect(() => {
    abandoned.current = onAbandoned
  })

  useEffect(() => {
    // Só enquanto a tela está de fato descansando: ao primeiro toque a fase
    // muda e a contagem do abandono é cancelada junto.
    if (phase !== 'on') return
    const id = window.setTimeout(() => abandoned.current(), ABANDONED_MS)
    return () => window.clearTimeout(id)
  }, [phase])

  // A saída fica montada enquanto some. São duas razões, e a segunda é a séria:
  // dá tempo da tela se apagar suavemente, e principalmente engole o `click`
  // que vem logo depois do `pointerdown`. Desmontando na hora, esse clique caía
  // no card que estava por baixo e o cliente adicionava um produto sem querer,
  // dependendo de onde tivesse tocado.
  useEffect(() => {
    if (phase !== 'leaving') return
    const id = window.setTimeout(() => setPhase('off'), LEAVE_MS)
    return () => window.clearTimeout(id)
  }, [phase])

  useEffect(() => {
    if (!enabled) {
      setPhase('off')
      return
    }

    const arm = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setPhase('on'), IDLE_MS)
    }
    // Atualização por função para não depender do valor capturado no momento em
    // que o ouvinte foi registrado.
    const wake = () => {
      setPhase((p) => (p === 'on' ? 'leaving' : p))
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

  if (!enabled || phase === 'off') return null

  return (
    <div
      className={`screensaver ${phase === 'leaving' ? 'screensaver--leaving' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPhase((p) => (p === 'on' ? 'leaving' : p))
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
