import { MessageCircleMore } from 'lucide-react'

interface Props {
  onOpen: () => void
}

/**
 * Atalho flutuante pra assistente, visível em qualquer aba do painel
 * (montado uma vez em App.tsx, fora dos blocos de aba). A conversa em si
 * mora na aba "Assistente" — clicar aqui só leva até lá, evitando duas
 * telas de chat independentes brigando pelo mesmo histórico.
 */
export default function AssistantChat({ onOpen }: Props) {
  return (
    <button className="assistant-fab" onClick={onOpen} aria-label="Abrir assistente">
      <MessageCircleMore size={22} strokeWidth={2} aria-hidden />
    </button>
  )
}
