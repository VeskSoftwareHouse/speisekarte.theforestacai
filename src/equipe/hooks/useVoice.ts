import { useCallback, useEffect, useRef, useState } from 'react'

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
    window.speechSynthesis?.cancel()
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

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  const speak = useCallback(
    (texto: string) => {
      if (!ttsSupported || !texto.trim()) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(texto)
      utterance.lang = 'pt-BR'
      const voz = escolherVozPortuguesa()
      if (voz) utterance.voice = voz
      window.speechSynthesis.speak(utterance)
    },
    [ttsSupported],
  )

  // Desliga tudo se o componente sumir com o microfone ligado ou o Tuco no
  // meio de uma fala — sem isso o áudio continuaria mesmo com o chat fechado.
  useEffect(
    () => () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    },
    [],
  )

  return { sttSupported, ttsSupported, listening, sttError, startListening, stopListening, speak, stopSpeaking }
}
