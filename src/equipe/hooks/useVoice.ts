import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '@shared/authFetch'

// A Web Speech API não tem tipos oficiais completos no TS/DOM lib pra
// reconhecimento de fala (só pra síntese) — o mínimo que este hook usa,
// tipado à mão em vez de recorrer a `any` solto.
interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}
interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

// Quanto de fala juntar antes de começar a tocar, e a pausa inserida se a
// geração ficar pra trás no meio da fala. Calibrado medindo o streaming do
// Gemini TTS: o primeiro pedaço chega em ~0,9 s, mas a geração é um pouco
// mais lenta que a fala em si.
const PREBUFFER_S = 0.6
const REBUFFER_S = 0.25

// Tamanho máximo de cada trecho mandado pra voz IA. Uma resposta longa (ex:
// lista de clientes) numa requisição só estourava o limite da rota e o tempo
// da função — o Tuco parava de falar na metade. Trechos curtos geram rápido
// e são emendados no mesmo tocador.
const MAX_TRECHO = 350

/** Quebra o texto em trechos de até MAX_TRECHO caracteres, respeitando linhas
 * e frases sempre que possível (a pausa entre trechos cai num lugar natural). */
function dividirEmTrechos(texto: string): string[] {
  const pedacos: string[] = []
  for (const linha of texto.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    if (linha.length <= MAX_TRECHO) {
      pedacos.push(linha)
      continue
    }
    for (const frase of linha.split(/(?<=[.!?])\s+/)) {
      if (frase.length <= MAX_TRECHO) {
        pedacos.push(frase)
        continue
      }
      let atual = ''
      for (const palavra of frase.split(/\s+/)) {
        if (atual && atual.length + palavra.length + 1 > MAX_TRECHO) {
          pedacos.push(atual)
          atual = palavra
        } else {
          atual = atual ? `${atual} ${palavra}` : palavra
        }
      }
      if (atual) pedacos.push(atual)
    }
  }

  // Junta pedaços pequenos vizinhos (ex: uma linha por nome) pra não abrir
  // uma requisição por nome.
  const trechos: string[] = []
  for (const pedaco of pedacos) {
    const ultimo = trechos[trechos.length - 1]
    if (ultimo !== undefined && ultimo.length + pedaco.length + 1 <= MAX_TRECHO) {
      trechos[trechos.length - 1] = `${ultimo}\n${pedaco}`
    } else {
      trechos.push(pedaco)
    }
  }
  return trechos
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** A voz portuguesa mais próxima do que o navegador tem instalado — pt-BR
 * exato primeiro, qualquer pt- depois. `undefined` deixa a síntese usar a
 * voz padrão do sistema pro idioma indicado em `utterance.lang`. */
function escolherVozPortuguesa(): SpeechSynthesisVoice | undefined {
  const vozes = window.speechSynthesis?.getVoices() ?? []
  return vozes.find((v) => v.lang === 'pt-BR') ?? vozes.find((v) => v.lang.startsWith('pt'))
}

/**
 * Fala com o Tuco em vez de digitar, e ouve a resposta dele em voz alta —
 * tudo pelo navegador (Web Speech API), sem servidor nem custo por uso.
 * Reconhecimento de voz varia de suporte por navegador (bom no Chrome e no
 * Android, ausente no Firefox); síntese de voz é bem mais universal — por
 * isso os dois têm flags de suporte separadas.
 */
export function useVoice(onTranscricaoFinal: (texto: string) => void) {
  const [listening, setListening] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTranscricaoFinalRef = useRef(onTranscricaoFinal)
  onTranscricaoFinalRef.current = onTranscricaoFinal

  const sttSupported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor()
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    // Cala o Tuco antes de ouvir — senão o microfone capta a própria voz dele.
    stopSpeakingRef.current()
    // Aproveita o clique pra liberar o áudio da resposta que vem depois.
    prepararAudioRef.current()
    setSttError(null)

    const recognition = new Ctor()
    recognition.lang = 'pt-BR'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const ultimo = event.results[event.results.length - 1]
      if (ultimo?.isFinal) onTranscricaoFinalRef.current(ultimo[0].transcript)
    }
    recognition.onerror = (event) => {
      setSttError(
        event.error === 'not-allowed' || event.error === 'permission-denied'
          ? 'Preciso de permissão pra usar o microfone.'
          : event.error === 'no-speech'
            ? 'Não ouvi nada — tenta de novo?'
            : 'Não consegui te ouvir agora.',
      )
      setListening(false)
    }
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [])

  // Tocador da voz IA: um AudioContext reaproveitado, os pedaços agendados da
  // fala atual, o fetch em andamento, e um contador pra descartar respostas
  // que chegarem depois de um stopSpeaking() ou de uma fala mais nova.
  const ctxRef = useRef<AudioContext | null>(null)
  const fontesRef = useRef<AudioBufferSourceNode[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const falaIdRef = useRef(0)

  /** Cria/retoma o AudioContext. Chamado num clique (microfone, enviar) —
   * navegadores só deixam tocar som depois de um gesto do usuário, e o
   * áudio da resposta chega segundos depois, fora do clique. */
  const prepararAudio = useCallback(() => {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return null
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume()
    return ctxRef.current
  }, [])

  const pararAudio = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    for (const fonte of fontesRef.current) {
      try {
        fonte.stop()
      } catch {
        // Já tinha terminado de tocar.
      }
    }
    fontesRef.current = []
  }, [])

  const stopSpeaking = useCallback(() => {
    falaIdRef.current++
    pararAudio()
    window.speechSynthesis?.cancel()
  }, [pararAudio])
  // startListening é declarado antes e usa estes dois — via ref.
  const stopSpeakingRef = useRef(stopSpeaking)
  stopSpeakingRef.current = stopSpeaking
  const prepararAudioRef = useRef(prepararAudio)
  prepararAudioRef.current = prepararAudio

  /** Voz do navegador — só usada se a voz IA (api/tuco-voz) falhar. */
  const falarPeloNavegador = useCallback(
    (texto: string) => {
      if (!ttsSupported) return
      const synth = window.speechSynthesis
      const falar = () => {
        const utterance = new SpeechSynthesisUtterance(texto)
        utterance.lang = 'pt-BR'
        const voz = escolherVozPortuguesa()
        if (voz) utterance.voice = voz
        synth.resume()
        synth.speak(utterance)
      }
      // No Chrome, cancel() seguido de speak() no mesmo instante às vezes
      // descarta a fala nova em silêncio — só cancela se tiver algo tocando,
      // e dá um respiro antes de falar.
      if (synth.speaking || synth.pending) {
        synth.cancel()
        setTimeout(falar, 100)
      } else {
        falar()
      }
    },
    [ttsSupported],
  )

  /**
   * Fala com a voz IA do Gemini (natural e igual em todo aparelho), tocando o
   * áudio em streaming: começa assim que junta um pouquinho de fala, em vez
   * de esperar a resposta inteira ser gerada. Se a rota falhar antes de
   * tocar qualquer coisa, cai na voz do navegador.
   */
  const speak = useCallback(
    async (texto: string) => {
      if (!texto.trim()) return
      stopSpeaking()
      const id = falaIdRef.current
      const controller = new AbortController()
      abortRef.current = controller
      const trechos = dividirEmTrechos(texto)
      let tocou = false
      let trechoAtual = 0
      let cursor = 0 // quando (no relógio do AudioContext) o próximo pedaço começa
      try {
        const ctx = prepararAudio()
        if (!ctx) throw new Error('Web Audio indisponível')

        // Cada trecho é pedido assim que o anterior começa a ser lido — a
        // geração do próximo já corre enquanto o atual toca, sem pedir todos
        // de uma vez (se a pessoa interromper, não gasta à toa).
        const pedidos = new Map<number, Promise<Response>>()
        const pedir = (i: number) => {
          if (i >= trechos.length || pedidos.has(i)) return
          const promessa = authFetch('/api/tuco-voz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: trechos[i] }),
            signal: controller.signal,
          })
          promessa.catch(() => {}) // tratado quando o trecho for lido
          pedidos.set(i, promessa)
        }

        let fila: Float32Array<ArrayBuffer>[] = [] // áudio recebido e ainda não agendado
        let segundosNaFila = 0
        let sampleRate = 24000

        const agendarFila = () => {
          // Chegou atrasado (a geração ficou pra trás da fala): em vez de tocar
          // picotado, faz uma pausa curta e segue — soa como uma respiração.
          if (cursor < ctx.currentTime + 0.02) cursor = ctx.currentTime + (tocou ? REBUFFER_S : 0.05)
          for (const amostras of fila) {
            const buffer = ctx.createBuffer(1, amostras.length, sampleRate)
            buffer.copyToChannel(amostras, 0)
            const fonte = ctx.createBufferSource()
            fonte.buffer = buffer
            fonte.connect(ctx.destination)
            fonte.start(cursor)
            fonte.onended = () => {
              fontesRef.current = fontesRef.current.filter((f) => f !== fonte)
            }
            fontesRef.current.push(fonte)
            cursor += buffer.duration
          }
          fila = []
          segundosNaFila = 0
          tocou = true
        }

        for (; trechoAtual < trechos.length; trechoAtual++) {
          pedir(trechoAtual)
          pedir(trechoAtual + 1)
          const res = await pedidos.get(trechoAtual)!
          if (id !== falaIdRef.current) return
          if (!res.ok || !res.body) throw new Error(`Voz IA falhou (${res.status})`)
          if (ctx.state !== 'running') await ctx.resume()
          if (ctx.state !== 'running') throw new Error('Navegador bloqueou o áudio')

          sampleRate = Number(res.headers.get('X-Sample-Rate')) || 24000
          const reader = res.body.getReader()
          let sobra: Uint8Array | null = null // byte ímpar que ficou entre dois pedaços
          let recebeuAudio = false

          for (;;) {
            const { done, value } = await reader.read()
            if (id !== falaIdRef.current) return
            if (done) break
            if (!value?.length) continue

            let bytes = value
            if (sobra) {
              bytes = new Uint8Array(sobra.length + value.length)
              bytes.set(sobra)
              bytes.set(value, sobra.length)
              sobra = null
            }
            const total = bytes.length - (bytes.length % 2)
            if (total < bytes.length) sobra = bytes.slice(total)
            if (!total) continue
            const view = new DataView(bytes.buffer, bytes.byteOffset, total)
            const amostras = new Float32Array(total / 2)
            for (let i = 0; i < amostras.length; i++) amostras[i] = view.getInt16(i * 2, true) / 32768
            fila.push(amostras)
            segundosNaFila += amostras.length / sampleRate
            recebeuAudio = true

            // Primeiro junta um pouco de fala (absorve oscilação da rede e da
            // geração); depois disso, agenda cada pedaço assim que chega.
            if (tocou || segundosNaFila >= PREBUFFER_S) agendarFila()
          }
          if (fila.length) agendarFila()
          if (!recebeuAudio) throw new Error('Voz IA veio vazia')
        }
      } catch (err) {
        if (id !== falaIdRef.current) return
        console.warn('Voz IA do Tuco indisponível; usando a voz do navegador.', err)
        const ctx = ctxRef.current
        if (!tocou || !ctx) {
          pararAudio()
          falarPeloNavegador(texto)
          return
        }
        // Falhou no meio: deixa terminar o que já foi agendado e lê o resto
        // pela voz do navegador, em vez de o Tuco ficar mudo na metade.
        abortRef.current?.abort()
        const resto = trechos.slice(trechoAtual).join('\n')
        const esperaMs = Math.max(0, (cursor - ctx.currentTime) * 1000)
        setTimeout(() => {
          if (id === falaIdRef.current) falarPeloNavegador(resto)
        }, esperaMs)
      }
    },
    [stopSpeaking, prepararAudio, pararAudio, falarPeloNavegador],
  )

  // Desliga tudo se o componente sumir com o microfone ligado ou o Tuco no
  // meio de uma fala — sem isso o áudio continuaria mesmo com o chat fechado.
  useEffect(
    () => () => {
      recognitionRef.current?.stop()
      stopSpeaking()
    },
    [stopSpeaking],
  )

  return {
    sttSupported,
    ttsSupported,
    listening,
    sttError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    prepararAudio,
  }
}
