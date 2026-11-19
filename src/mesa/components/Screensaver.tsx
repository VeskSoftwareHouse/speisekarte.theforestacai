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
// Versão maior para o totem (tela de 32"), onde ela substitui o vídeo de vez.
const ANIM_TOTEM_SRC = '/brand/descanso-acai-2-720.webp'
// Foto parada do totem, em tamanho de tela cheia (o poster comum tem 540 px).
const POSTER_TOTEM_SRC = '/brand/descanso-acai-2-totem.jpg'

const isTotem = () => document.documentElement.hasAttribute('data-totem')

/*
 * Totem (painel Android de sinalização, ex.: iiyama TF3239AS). Mostrar o
 * <video> direto não serve lá: o chip de vídeo desenha numa camada própria por
 * cima da página, com os canais de cor trocados (o roxo saía azul), cobrindo o
 * "Peça aqui" e travando o toque para sair. A imagem animada também não: cada
 * quadro redesenha a tela inteira (o Android dele roda em 4K) e o toque ficava
 * na fila.
 *
 * Então lá o vídeo toca escondido num ponto de 2 px e, a cada quadro, é
 * copiado para um <canvas> em tela cheia. O chip só decodifica; quem mostra é
 * a placa de vídeo, junto com a página — cores certas, "Peça aqui" por cima,
 * toque normal, e o canvas atualiza sem redesenhar o resto. O <video> nunca é
 * removido da página (só pausado): desmontá-lo tocando era suspeito do
 * travamento.
 *
 * `?descanso=foto` (foto com zoom) e `?descanso=anim` (WebP animado) trocam o
 * modo naquele aparelho, para comparar; `?descanso=video` volta ao padrão.
 */
type TotemMode = 'video' | 'foto' | 'anim'
const totemMode: TotemMode = (() => {
  const param = new URLSearchParams(window.location.search).get('descanso')
  const valid = (m: string | null): m is TotemMode => m === 'video' || m === 'foto' || m === 'anim'
  try {
    if (param === 'video') localStorage.removeItem('mesa:descanso')
    else if (valid(param)) localStorage.setItem('mesa:descanso', param)
    const saved = localStorage.getItem('mesa:descanso')
    return valid(saved) ? saved : 'video'
  } catch {
    return valid(param) ? param : 'video'
  }
})()

let totemVideo: HTMLVideoElement | null = null
/** O <video> fonte do totem: criado uma vez, fica na página para sempre. */
function getTotemVideo(): HTMLVideoElement {
  if (totemVideo) return totemVideo
  const v = document.createElement('video')
  v.className = 'screensaver__source'
  v.src = VIDEO_SRC
  v.muted = true
  v.defaultMuted = true
  v.setAttribute('muted', '')
  v.loop = true
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.preload = 'auto'
  v.disablePictureInPicture = true
  v.setAttribute('disableremoteplayback', '')
  v.setAttribute('aria-hidden', 'true')
  document.body.appendChild(v)
  totemVideo = v
  return v
}

/** iPhone/iPad (inclui iPad que se apresenta como Mac). */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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
  // adianta o download do plano B. Só no iOS, que é onde o bloqueio existe:
  // em painéis Android, ligar o decodificador de vídeo logo na abertura da
  // página travava o navegador inteiro.
  if (isIOS()) {
    v.play()
      .then(() => {
        videoUnlocked = true
        if (!v.isConnected) v.pause()
      })
      .catch(preloadAnim)
  }
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
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
      if (!totem && isIOS() && GESTURES.has(e.type)) unlockVideo()
      setPhase((p) => (p === 'on' ? 'leaving' : p))
      arm()
    }

    // Já começa a baixar o que o descanso vai mostrar, para ele abrir sem espera.
    const totem = isTotem()
    if (totem) new Image().src = totemMode === 'anim' ? ANIM_TOTEM_SRC : POSTER_TOTEM_SRC
    // Fora do iOS o vídeo só nasce quando o descanso abre: nada de vídeo
    // carregado em segundo plano enquanto o cliente navega no cardápio.
    else if (isIOS()) getVideo()

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
  const totem = isTotem()

  useEffect(() => {
    const slot = videoSlot.current
    if (!showing || !slot || totem) return
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
  }, [showing, totem])

  // Totem: o vídeo escondido é copiado quadro a quadro para o canvas.
  const totemVideoMode = totem && totemMode === 'video'
  useEffect(() => {
    const canvas = canvasRef.current
    if (!showing || !totemVideoMode || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setVideoBlocked(true)
      return
    }
    const v = getTotemVideo()
    setVideoBlocked(false)
    let stopped = false
    let raf = 0
    type FrameCallbackVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
    const fv = v as FrameCallbackVideo

    const draw = () => {
      if (stopped) return
      if (v.readyState >= 2) {
        try {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        } catch {
          stopped = true
          setVideoBlocked(true)
          return
        }
      }
      schedule()
    }
    // requestVideoFrameCallback desenha só quando chega quadro novo (30 por
    // segundo, não 60); sem ele, a cada quadro de tela.
    const schedule = () => {
      if (fv.requestVideoFrameCallback) fv.requestVideoFrameCallback(draw)
      else raf = requestAnimationFrame(draw)
    }

    const startTime = v.currentTime
    v.play()
      .then(schedule)
      .catch(() => setVideoBlocked(true))
    const check = window.setTimeout(() => {
      if (v.paused || v.currentTime === startTime) setVideoBlocked(true)
    }, STALL_MS * 2)

    return () => {
      stopped = true
      window.clearTimeout(check)
      cancelAnimationFrame(raf)
      v.pause()
    }
  }, [showing, totemVideoMode])

  if (!showing) return null

  return (
    <div
      className={`screensaver ${phase === 'leaving' ? 'screensaver--leaving' : ''} ${totem || videoBlocked ? 'screensaver--still' : ''}`}
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
      {/* Totem: foto por baixo (aparece até o primeiro quadro, e fica com zoom
          lento se o vídeo não tocar ou no modo "foto"), canvas do vídeo por cima. */}
      {totem && totemMode !== 'anim' && (
        <img
          className={`screensaver__still ${totemMode === 'foto' || videoBlocked ? 'screensaver__still--zoom' : ''}`}
          src={POSTER_TOTEM_SRC}
          alt=""
          aria-hidden
        />
      )}
      {totemVideoMode && !videoBlocked && (
        <canvas ref={canvasRef} className="screensaver__canvas" width={720} height={1280} aria-hidden />
      )}
      {((totem && totemMode === 'anim') || (!totem && videoBlocked)) && (
        <>
          <img className="screensaver__still" src={POSTER_SRC} alt="" aria-hidden />
          <img className="screensaver__still" src={totem ? ANIM_TOTEM_SRC : ANIM_SRC} alt="" aria-hidden />
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
