import { createPortal } from 'react-dom'
import type { OrderWithItems } from '@shared/types'

interface Props {
  order: OrderWithItems | null
}

/**
 * Etiqueta só com o nome do cliente — pensada pra impressora pequena de
 * adesivo, colada no copo de açaí (não é a comanda da cozinha, que já
 * aparece inteira no card do quadro). Fica fora do fluxo normal da tela
 * (portal direto no body) e só aparece de fato via CSS de @media print,
 * quando `document.body` ganha a classe `printing-comanda` (ver App.tsx) —
 * isso também esconde o resto do app na hora de imprimir, sem interferir no
 * "Imprimir" dos Relatórios, que imprime a página inteira.
 */
export default function ComandaPrint({ order }: Props) {
  if (!order) return null

  return createPortal(
    <div className="comanda-print">
      <span className="comanda-print__customer">{order.nome_cliente ?? 'Sem nome'}</span>
    </div>,
    document.body,
  )
}
