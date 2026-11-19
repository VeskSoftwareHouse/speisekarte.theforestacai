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

const VIDEO_SRC = '/brand/descanso-acai-2.mp4'
const POSTER_SRC = '/brand/descanso-acai-2-poster.jpg'
// O mesmo vídeo como imagem animada (WebP, 540 px, 20 qps). O Safari anima
// imagens sozinho mesmo quando bloqueia vídeo (economia de bateria), então
// é ela que garante movimento sem ninguém tocar na tela.
const ANIM_SRC = '/brand/descanso-acai-2.webp'
/** Se o vídeo não andar neste tempo, o navegador bloqueou: entra o plano B. */
const STALL_MS = 1500
// Eventos que contam como gesto do usuário para o navegador liberar mídia.
const GESTURES = new Set(['pointerdown', 'touchstart', 'click', 'keydown'])

/*
 * Um único <video> para a vida toda da página. O iPad (Safari) só deixa um
 * vídeo começar sozinho se ele já foi tocado alguma vez a partir de um toque do
 * usuário — e em modo de economia de bateria nem o vídeo mudo escapa. Como o
 * descanso abre por inatividade, nunca há um toque na hora. Então o vídeo é
 * criado uma vez, "liberado" com play+pause no primeiro toque no cardápio, e
 * reaproveitado cada vez que o descanso abre. Recriar o elemento perderia a
 * liberação (ela vale por elemento).
 */
let sharedVideo: HTMLVideoElement | null = null
let videoUnlocked = false
let animPreloaded = false

/** Baixa a imagem animada antes da hora, para o plano B já abrir se mexendo. */
function preloadAnim() {
  if (animPreloaded) return
  animPreloaded = true
  new Image().src = ANIM_SRC
}

function getVideo(): HTMLVideoElement {
  if (sharedVideo) return sharedVideo
  const v = document.createElement('video')
  v.className = 'screensaver__video'
  v.src = VIDEO_SRC
  v.poster = POSTER_SRC
  // muted como propriedade E atributo: o Safari olha os dois para autoplay.
  v.muted = true
  v.defaultMuted = true
  v.setAttribute('muted', '')
  v.loop = true
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.setAttribute('webkit-playsinline', '')
  v.preload = 'auto'
  v.disablePictureInPicture = true
  v.setAttribute('aria-hidden', 'true')
  sharedVideo = v
  // Sonda: este aparelho deixa vídeo começar sozinho? Se não deixar, já
  // adianta o download do plano B.
  v.play()
    .then(() => {
      videoUnlocked = true
      if (!v.isConnected) v.pause()
    })
    .catch(preloadAnim)
  return v
}

/** Play e pause dentro de um toque: daí em diante o vídeo pode tocar sozinho. */
function unlockVideo() {
  if (videoUnlocked) return
  const v = getVideo()
  if (v.isConnected && !v.paused) {
    videoUnlocked = true
    return
  }
  v.play()
    .then(() => {
      videoUnlocked = true
      // Só pausa se o descanso não estiver na tela usando o vídeo.
      if (!v.isConnected) v.pause()
    })
    .catch(() => {
      // Sem liberação agora; tenta de novo no próximo toque.
      preloadAnim()
    })
}

interface Props {
  /** Falso durante o pagamento, onde cobrir a tela seria péssimo. */
  enabled: boolean
  /** Chamado quando o descanso já dura ABANDONED_MS: a mesa está livre. */
  onAbandoned: () => void
}

export default function Screensaver({ enabled, onAbandoned }: Props) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<Phase>('off')
  const [videoBlocked, setVideoBlocked] = useState(false)
  const timer = useRef<number>()
  const videoSlot = useRef<HTMLDivElement>(null)

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
    const wake = (e: Event) => {
      if (GESTURES.has(e.type)) unlockVideo()
      setPhase((p) => (p === 'on' ? 'leaving' : p))
      arm()
    }

    // Já cria e começa a baixar o vídeo, para o descanso abrir sem espera.
    getVideo()

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

  const showing = enabled && phase !== 'off'

  useEffect(() => {
    const slot = videoSlot.current
    if (!showing || !slot) return
    const v = getVideo()
    slot.appendChild(v)
    setVideoBlocked(false)

    const startTime = v.currentTime
    const onPlaying = () => setVideoBlocked(false)
    v.addEventListener('playing', onPlaying)
    v.play().catch(() => {
      preloadAnim()
      setVideoBlocked(true)
    })
    // play() pode "resolver" e o quadro continuar parado (economia de bateria):
    // por isso confere se o tempo do vídeo andou de fato.
    const check = window.setTimeout(() => {
      if (v.paused || v.currentTime === startTime) setVideoBlocked(true)
    }, STALL_MS)

    return () => {
      window.clearTimeout(check)
      v.removeEventListener('playing', onPlaying)
      v.pause()
      v.remove()
    }
  }, [showing])

  if (!showing) return null

  return (
    <div
      className={`screensaver ${phase === 'leaving' ? 'screensaver--leaving' : ''} ${videoBlocked ? 'screensaver--still' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setPhase((p) => (p === 'on' ? 'leaving' : p))
      }}
      role="presentation"
    >
      {/* O vídeo (já com a logo no topo) é encaixado aqui pelo efeito acima. */}
      <div ref={videoSlot} className="screensaver__video-slot" aria-hidden />
      {/* Plano B quando o navegador não deixa o vídeo tocar: o mesmo vídeo
          como imagem animada, que começa sozinha. O quadro estático fica por
          baixo enquanto ela ainda baixa. */}
      {videoBlocked && (
        <>
          <img className="screensaver__still" src={POSTER_SRC} alt="" aria-hidden />
          <img className="screensaver__still" src={ANIM_SRC} alt="" aria-hidden />
        </>
      )}
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
