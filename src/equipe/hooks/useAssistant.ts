import { useCallback, useState } from 'react'
import type { Content } from '@google/genai'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Conversa com a assistente de IA do painel (api/assistant-chat.ts). O
 * histórico bruto do Gemini (`contents`) é só um estado de passagem — nunca
 * renderizado direto, só reenviado a cada turno pra a conversa ter memória
 * sem precisar de sessão nenhuma no servidor. `messages` é o que aparece na
 * tela.
 */
export function useAssistant(accessToken: string) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [contents, setContents] = useState<Content[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || sending) return
      setSending(true)
      setError(null)
      setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
      try {
        const res = await fetch('/api/assistant-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ message: trimmed, contents }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Não foi possível falar com a assistente.')
        setContents(data.contents ?? [])
        setMessages((prev) => [...prev, { role: 'assistant', text: data.reply ?? '' }])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível falar com a assistente.')
      } finally {
        setSending(false)
      }
    },
    [accessToken, contents, sending],
  )

  return { messages, sending, error, sendMessage }
}
