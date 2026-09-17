import { useCallback, useEffect, useState } from 'react'
import type { Content, Part } from '@google/genai'
import { authFetch } from '@shared/authFetch'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  text: string
  /** Preview da foto anexada nesta mensagem (data URL) — só existe na sessão
   * atual; ao recarregar uma conversa salva, a imagem em si não volta, só o
   * texto que o Tuco já tiver extraído dela. */
  imagemPreview?: string
}

export interface AssistantImagem {
  /** Bytes da imagem em base64, sem o prefixo "data:...;base64,". */
  base64: string
  mimeType: string
}

export interface ConversaResumo {
  id: string
  preview: string
  atualizadoEm: string
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
 * Conversa com a assistente de IA do painel (api/assistant-chat.ts). Cada
 * conversa é uma linha em `assistente_conversas`; ao montar, carrega a mais
 * recente (continua de onde parou), e `listarConversas`/`abrirConversa`
 * dão acesso às conversas antigas sem perder nada.
 */
export function useAssistant(accessToken: string) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [contents, setContents] = useState<Content[]>([])
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [loadingHistorico, setLoadingHistorico] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    authFetch('/api/assistant-chat', undefined, accessToken)
      .then((res) => res.json())
      .then((data) => {
        if (cancelado) return
        const carregado = (data?.contents ?? []) as Content[]
        setConversaId(data?.conversaId ?? null)
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
    async (text: string, imagem?: AssistantImagem) => {
      const trimmed = text.trim()
      if ((!trimmed && !imagem) || sending) return
      setSending(true)
      setError(null)
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          text: trimmed,
          imagemPreview: imagem ? `data:${imagem.mimeType};base64,${imagem.base64}` : undefined,
        },
      ])
      try {
        const res = await authFetch(
          '/api/assistant-chat',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: trimmed, imagem, contents, conversaId }),
          },
          accessToken,
        )
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Não foi possível falar com a assistente.')
        setContents(data.contents ?? [])
        setConversaId(data.conversaId ?? null)
        setMessages((prev) => [...prev, { role: 'assistant', text: data.reply ?? '' }])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível falar com a assistente.')
      } finally {
        setSending(false)
      }
    },
    [accessToken, contents, conversaId, sending],
  )

  /** Começa uma conversa nova sem apagar a atual — ela continua acessível
   * pelo histórico, já que só foi salva, nunca excluída. */
  const startNewConversation = useCallback(() => {
    setConversaId(null)
    setContents([])
    setMessages([])
    setError(null)
  }, [])

  const listarConversas = useCallback(async (): Promise<ConversaResumo[]> => {
    try {
      const res = await authFetch('/api/assistant-chat?list=1', undefined, accessToken)
      const data = await res.json()
      return (data?.conversas ?? []) as ConversaResumo[]
    } catch {
      return []
    }
  }, [accessToken])

  const abrirConversa = useCallback(
    async (id: string) => {
      setLoadingHistorico(true)
      setError(null)
      try {
        const res = await authFetch(`/api/assistant-chat?id=${id}`, undefined, accessToken)
        const data = await res.json()
        const carregado = (data?.contents ?? []) as Content[]
        setConversaId(data?.conversaId ?? id)
        setContents(carregado)
        setMessages(extrairMensagens(carregado))
      } catch {
        setError('Não foi possível abrir essa conversa.')
      } finally {
        setLoadingHistorico(false)
      }
    },
    [accessToken],
  )

  const excluirConversa = useCallback(
    async (id: string) => {
      try {
        await authFetch(`/api/assistant-chat?id=${id}`, { method: 'DELETE' }, accessToken)
      } catch {
        // Sem sorte pra apagar do servidor — some da lista mesmo assim (o
        // chamador já atualiza a UI local).
      }
      if (id === conversaId) startNewConversation()
    },
    [accessToken, conversaId, startNewConversation],
  )

  return {
    messages,
    sending,
    error,
    loadingHistorico,
    sendMessage,
    startNewConversation,
    listarConversas,
    abrirConversa,
    excluirConversa,
  }
}
