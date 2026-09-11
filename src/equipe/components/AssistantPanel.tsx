import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Send } from 'lucide-react'
import { useAssistant } from '../hooks/useAssistant'

interface Props {
  accessToken: string
}

/**
 * Tela cheia da assistente de IA — o histórico é salvo no servidor (ver
 * useAssistant), então a conversa continua de onde parou mesmo depois de
 * recarregar a página.
 */
export default function AssistantPanel({ accessToken }: Props) {
  const [input, setInput] = useState('')
  const { messages, sending, error, loadingHistorico, sendMessage, clearConversation } = useAssistant(accessToken)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
  }

  return (
    <div className="assistant-page">
      <header className="assistant-page__header">
        <h2>Assistente</h2>
        <button
          className="btn btn-outline"
          onClick={clearConversation}
          disabled={messages.length === 0 && !loadingHistorico}
          title="Começar uma conversa nova"
        >
          <RotateCcw size={16} strokeWidth={2} />
          Nova conversa
        </button>
      </header>

      <div className="assistant-page__messages" ref={listRef}>
        {loadingHistorico && <p className="equipe-app__status">Carregando conversa…</p>}
        {!loadingHistorico && messages.length === 0 && (
          <p className="assistant-panel__hint">
            Pergunte sobre vendas, estoque, cardápio ou pedidos — ou peça pra cadastrar/editar algo (produto, insumo,
            fornecedor...). Ex: &ldquo;quanto vendemos hoje?&rdquo; ou &ldquo;cadastra um novo insumo&rdquo;.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`assistant-bubble assistant-bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
        {sending && <div className="assistant-bubble assistant-bubble--assistant assistant-bubble--typing">Digitando…</div>}
        {error && <p className="admin-form__error">{error}</p>}
      </div>

      <form className="assistant-page__form" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte alguma coisa…"
          disabled={sending || loadingHistorico}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={sending || loadingHistorico || !input.trim()}
          aria-label="Enviar"
        >
          <Send size={16} strokeWidth={2} />
        </button>
      </form>
    </div>
  )
}
