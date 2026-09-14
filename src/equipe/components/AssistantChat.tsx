import { useEffect, useRef, useState } from 'react'
import { History, Mic, Plus, Send, Trash2, X } from 'lucide-react'
import { useAssistant, type ConversaResumo } from '../hooks/useAssistant'
import { useVoice } from '../hooks/useVoice'

interface Props {
  accessToken: string
}

/**
 * Chat flutuante do Tuco — o tucano da marca virou o mascote da assistente
 * de IA, disponível em qualquer aba do painel (montado uma vez em App.tsx,
 * fora dos blocos de aba). Sem overlay que escurece a tela — diferente de um
 * modal de confirmação, um chat deve deixar a equipe ver o resto da tela
 * enquanto conversa. "Nova conversa" não apaga nada — só troca pra uma em
 * branco; a lista de conversas antigas é como se volta pras anteriores.
 */
export default function AssistantChat({ accessToken }: Props) {
  const [open, setOpen] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [conversas, setConversas] = useState<ConversaResumo[]>([])
  const [input, setInput] = useState('')
  const {
    messages,
    sending,
    error,
    loadingHistorico,
    sendMessage,
    startNewConversation,
    listarConversas,
    abrirConversa,
    excluirConversa,
  } = useAssistant(accessToken)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Quantas mensagens já foram faladas em voz alta — começa null (ainda não
  // sabe) e é fixado assim que o histórico salvo termina de carregar, pra
  // nunca ler em voz alta uma conversa antiga inteira ao reabrir o chat, só
  // as respostas que chegarem dali pra frente.
  const faladasRef = useRef<number | null>(null)

  const { sttSupported, listening, sttError, startListening, stopListening, speak, stopSpeaking, prepararAudio } = useVoice(
    (texto) => {
      if (!texto.trim()) return
      sendMessage(texto)
      setInput('')
    },
  )

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (open && mostrarHistorico) listarConversas().then(setConversas)
  }, [open, mostrarHistorico, listarConversas])

  // Lê em voz alta assim que uma resposta nova do Tuco chega — não as que já
  // vieram no histórico salvo (ver comentário em faladasRef acima).
  useEffect(() => {
    // Carregando uma conversa (a inicial ou uma aberta pelo histórico): zera a
    // referência pra fixá-la de novo quando terminar, sem ler as antigas.
    if (loadingHistorico) {
      faladasRef.current = null
      return
    }
    if (faladasRef.current === null) {
      faladasRef.current = messages.length
      return
    }
    // "Nova conversa" esvazia a lista — sem reajustar, a referência ficaria no
    // tamanho da conversa anterior e nenhuma resposta nova seria falada.
    if (messages.length < faladasRef.current) {
      faladasRef.current = messages.length
      return
    }
    if (messages.length > faladasRef.current) {
      const novas = messages.slice(faladasRef.current)
      const ultimaDoTuco = [...novas].reverse().find((m) => m.role === 'assistant')
      if (ultimaDoTuco) speak(ultimaDoTuco.text)
      faladasRef.current = messages.length
    }
  }, [messages, loadingHistorico, speak])

  // Fechar o chat corta a fala e o microfone na hora — ninguém quer o Tuco
  // continuar falando com a janela fechada.
  useEffect(() => {
    if (!open) {
      stopSpeaking()
      stopListening()
    }
  }, [open, stopSpeaking, stopListening])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    // Libera o áudio ainda dentro do clique — a resposta falada chega depois.
    prepararAudio()
    sendMessage(input)
    setInput('')
  }

  async function handleAbrirConversa(id: string) {
    await abrirConversa(id)
    setMostrarHistorico(false)
  }

  async function handleExcluirConversa(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await excluirConversa(id)
    setConversas((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <>
      <button
        className={`assistant-fab ${open ? 'assistant-fab--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fechar assistente' : 'Abrir o Tuco, o assistente'}
      >
        {open ? (
          <X size={22} strokeWidth={2} aria-hidden />
        ) : (
          <video className="assistant-fab__mascote" src="/brand/mascote-tuco.mp4" autoPlay loop muted playsInline />
        )}
      </button>

      {open && (
        <div className="assistant-panel">
          <header className="assistant-panel__header">
            <div className="assistant-panel__brand">
              <video className="assistant-panel__mascote" src="/brand/mascote-tuco.mp4" autoPlay loop muted playsInline />
              <h2>Tuco - Seu tucano assistente</h2>
            </div>
            <div className="assistant-panel__header-actions">
              <button
                type="button"
                title="Conversas antigas"
                aria-label="Conversas antigas"
                className={mostrarHistorico ? 'assistant-panel__icon-btn assistant-panel__icon-btn--active' : 'assistant-panel__icon-btn'}
                onClick={() => setMostrarHistorico((v) => !v)}
              >
                <History size={16} strokeWidth={2} />
              </button>
              <button
                type="button"
                title="Nova conversa"
                aria-label="Nova conversa"
                className="assistant-panel__icon-btn"
                onClick={() => {
                  startNewConversation()
                  setMostrarHistorico(false)
                }}
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
          </header>

          {mostrarHistorico ? (
            <div className="assistant-panel__historico">
              {conversas.length === 0 && <p className="assistant-panel__hint">Nenhuma conversa salva ainda.</p>}
              {conversas.map((c) => (
                <button key={c.id} className="assistant-historico-item" onClick={() => handleAbrirConversa(c.id)}>
                  <span className="assistant-historico-item__texto">
                    <span className="assistant-historico-item__preview">{c.preview || '(sem mensagens)'}</span>
                    <span className="assistant-historico-item__data">
                      {new Date(c.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <Trash2
                    size={14}
                    strokeWidth={2}
                    className="assistant-historico-item__excluir"
                    onClick={(e) => handleExcluirConversa(e, c.id)}
                  />
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="assistant-panel__messages" ref={listRef}>
                {loadingHistorico && <p className="equipe-app__status">Carregando…</p>}
                {!loadingHistorico && messages.length === 0 && (
                  <div className="assistant-message">
                    <video
                      className="assistant-message__avatar"
                      src="/brand/mascote-tuco.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                    <div className="assistant-bubble assistant-bubble--assistant">
                      Oi, eu sou o Tuco. Bico grande, mas o olho é ainda maior: enxergo o painel inteiro daqui de
                      cima. Conto como estão as vendas e o lucro, consulto e atualizo o cardápio e o estoque,
                      acompanho compras, perdas e fechamento, e até cadastro ou edito coisas pra você, sempre te
                      mostrando um resumo antes de gravar qualquer coisa (prometo não voar com seus dados).
                      Pergunta à vontade, tipo &ldquo;quanto vendemos hoje?&rdquo; ou &ldquo;cadastra um novo
                      insumo&rdquo;.
                    </div>
                  </div>
                )}
                {messages.map((m, i) =>
                  m.role === 'assistant' ? (
                    <div key={i} className="assistant-message">
                      <video
                        className="assistant-message__avatar"
                        src="/brand/mascote-tuco.mp4"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                      <div className="assistant-bubble assistant-bubble--assistant">{m.text}</div>
                    </div>
                  ) : (
                    <div key={i} className="assistant-bubble assistant-bubble--user">
                      {m.text}
                    </div>
                  ),
                )}
                {sending && (
                  <div className="assistant-message">
                    <video
                      className="assistant-message__avatar"
                      src="/brand/mascote-tuco.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                    <div className="assistant-bubble assistant-bubble--assistant assistant-bubble--typing">Digitando…</div>
                  </div>
                )}
                {error && <p className="admin-form__error">{error}</p>}
                {sttError && <p className="admin-form__error">{sttError}</p>}
              </div>

              <form className="assistant-panel__form" onSubmit={handleSubmit}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={listening ? 'Ouvindo…' : 'Pergunte alguma coisa…'}
                  disabled={sending || loadingHistorico || listening}
                />
                {sttSupported && (
                  <button
                    type="button"
                    className={`assistant-panel__mic-btn ${listening ? 'assistant-panel__mic-btn--listening' : ''}`}
                    onClick={() => (listening ? stopListening() : startListening())}
                    disabled={sending || loadingHistorico}
                    aria-label={listening ? 'Parar de ouvir' : 'Falar com o Tuco'}
                    title={listening ? 'Parar de ouvir' : 'Falar com o Tuco'}
                  >
                    <Mic size={16} strokeWidth={2} />
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sending || loadingHistorico || !input.trim()}
                  aria-label="Enviar"
                >
                  <Send size={16} strokeWidth={2} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  )
}
