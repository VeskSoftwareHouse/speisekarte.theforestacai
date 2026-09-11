import { useCallback, useEffect, useState } from 'react'
import type { Content, Part } from '@google/genai'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
}

/**
 * Reconstrói as mensagens de tela a partir do histórico bruto do Gemini —
 * pula os turnos de chamada/resposta de ferramenta (que não têm `text`,
 * só `functionCall`/`functionResponse`), mostra só o que foi texto de
 * verdade entre usuário e assistente.
 */
function extrairMensagens(contents: Content[]): AssistantMessage[] {
  const mensagens: AssistantMessage[] = []
  for (const c of contents) {
    const textPart = c.parts?.find((p: Part) => typeof p.text === 'string')
    if (!textPart?.text) continue
    if (c.role === 'user') mensagens.push({ role: 'user', text: textPart.text })
    else if (c.role === 'model') mensagens.push({ role: 'assistant', text: textPart.text })
  }
  return mensagens
}

/**
 * Conversa com a assistente de IA do painel (api/assistant-chat.ts). O
 * histórico bruto do Gemini (`contents`) é salvo no servidor a cada troca
 * bem-sucedida (uma linha por usuário) — ao montar, este hook carrega o
 * que já existia, então a conversa continua de onde parou mesmo depois de
 * recarregar a página ou trocar de aba/dispositivo.
 */
export function useAssistant(accessToken: string) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [contents, setContents] = useState<Content[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    fetch('/api/assistant-chat', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => res.json())
      .then((data) => {
        if (cancelado) return
        const carregado = (data?.contents ?? []) as Content[]
        setContents(carregado)
        setMessages(extrairMensagens(carregado))
      })
      .catch(() => {
        // Sem histórico salvo (ou falha ao carregar) não é erro pra mostrar —
        // a conversa só começa vazia, como sempre começou antes de existir persistência.
      })
      .finally(() => {
        if (!cancelado) setLoadingHistorico(false)
      })
    return () => {
      cancelado = true
    }
  }, [accessToken])

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

  const clearConversation = useCallback(async () => {
    setMessages([])
    setContents([])
    setError(null)
    try {
      await fetch('/api/assistant-chat', { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } })
    } catch {
      // Falhar em apagar do servidor não impede começar de novo na tela —
      // na próxima troca bem-sucedida a conversa salva é sobrescrita mesmo.
    }
  }, [accessToken])

  return { messages, sending, error, loadingHistorico, sendMessage, clearConversation }
}
