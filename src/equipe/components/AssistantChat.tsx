import { useEffect, useRef, useState } from 'react'
import { MessageCircleMore, Send, X } from 'lucide-react'
import { useAssistant } from '../hooks/useAssistant'

interface Props {
  accessToken: string
}

/**
 * Chat flutuante da assistente de IA, disponível em qualquer aba do painel
 * (montado uma vez em App.tsx, fora dos blocos de aba). Sem overlay que
 * escurece a tela — diferente de um modal de confirmação, um chat deve
 * deixar a equipe ver o resto da tela enquanto conversa.
 */
export default function AssistantChat({ accessToken }: Props) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { messages, sending, error, sendMessage } = useAssistant(accessToken)
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
    <>
      <button
        className={`assistant-fab ${open ? 'assistant-fab--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Fechar assistente' : 'Abrir assistente'}
      >
        {open ? <X size={22} strokeWidth={2} aria-hidden /> : <MessageCircleMore size={22} strokeWidth={2} aria-hidden />}
      </button>

      {open && (
        <div className="assistant-panel">
          <header className="assistant-panel__header">
            <h2>Assistente</h2>
          </header>

          <div className="assistant-panel__messages" ref={listRef}>
            {messages.length === 0 && (
              <p className="assistant-panel__hint">
                Pergunte sobre vendas, faturamento ou estoque — ex: &ldquo;quanto vendemos hoje?&rdquo; ou &ldquo;quanto
                temos de açaí?&rdquo;.
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

          <form className="assistant-panel__form" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte alguma coisa…"
              disabled={sending}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()} aria-label="Enviar">
              <Send size={16} strokeWidth={2} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
