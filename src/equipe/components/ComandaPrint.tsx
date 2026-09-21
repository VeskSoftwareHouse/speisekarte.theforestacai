import { createPortal } from 'react-dom'
import type { OrderWithItems } from '@shared/types'
import { formatSelectedOptionLabel } from '@shared/format'

interface Props {
  order: OrderWithItems | null
}

/**
 * Versão da comanda só para impressão — nome do cliente bem grande no topo
 * (o pedido do Sergio: poder imprimir a comanda com o nome de quem pediu) e
 * os itens em texto simples, sem nada do quadro kanban. Fica fora do fluxo
 * normal da tela (portal direto no body) e só aparece de fato via CSS de
 * @media print, quando `document.body` ganha a classe `printing-comanda`
 * (ver App.tsx) — isso também esconde o resto do app na hora de imprimir,
 * sem interferir no "Imprimir" dos Relatórios, que imprime a página inteira.
 */
export default function ComandaPrint({ order }: Props) {
  if (!order) return null

  const quando = new Date(order.criado_em)

  return createPortal(
    <div className="comanda-print">
      <h1 className="comanda-print__customer">{order.nome_cliente ?? 'Sem nome'}</h1>
      <p className="comanda-print__meta">
        {quando.toLocaleDateString('pt-BR')} {quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </p>

      <ul className="comanda-print__items">
        {order.items.map((item) => (
          <li key={item.id} className="comanda-print__item">
            <div className="comanda-print__item-head">
              <span>{item.quantidade}×</span>
              <span>{item.nome_item}</span>
            </div>
            {item.modifiers_selecionados.length > 0 && (
              <p className="comanda-print__item-mods">
                {item.modifiers_selecionados.map((o) => formatSelectedOptionLabel(o.option_nome, o.quantidade)).join(' · ')}
              </p>
            )}
            {item.observacoes && <p className="comanda-print__item-obs">Obs: {item.observacoes}</p>}
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  )
}
