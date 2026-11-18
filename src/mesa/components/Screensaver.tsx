import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'

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
      {/* O vídeo já traz a logo no topo. Mudo e em loop: autoplay só é
          liberado pelo navegador sem som. */}
      <video
        className="screensaver__video"
        src="/brand/descanso-acai-2.mp4"
        poster="/brand/descanso-acai-2-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
      />
      <div className="screensaver__cta">
        <svg viewBox="0 0 24 24" className="screensaver__tap" aria-hidden>
          <path
            fill="currentColor"
            d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"
          />
        </svg>
        <p className="screensaver__hint">{t('screensaverHint')}</p>
      </div>
    </div>
  )
}
