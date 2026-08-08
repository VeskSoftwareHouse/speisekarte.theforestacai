import { ORDER_STATUS_LABEL } from '@shared/types'
import type { OrderWithItems, OrderStatus } from '@shared/types'
import { elapsedLabel, formatCHF } from '@shared/format'

const NEXT_ACTION_LABEL: Record<OrderStatus, string | null> = {
  recebido: 'Iniciar preparo',
  em_preparo: 'Marcar como pronto',
  pronto: 'Marcar como entregue',
  entregue: null,
}

const WAIT_WARNING_MIN = 10

interface Props {
  order: OrderWithItems
  isNew: boolean
  now: Date
  onAdvance: (order: OrderWithItems) => void
  onSeen: (orderId: string) => void
}

export default function OrderCard({ order, isNew, now, onAdvance, onSeen }: Props) {
  const nextLabel = NEXT_ACTION_LABEL[order.status]
  const itemCount = order.items.reduce((sum, i) => sum + i.quantidade, 0)
  const total = order.items.reduce((sum, i) => sum + i.preco_unitario * i.quantidade, 0)
  const waitingMin = Math.floor((now.getTime() - new Date(order.criado_em).getTime()) / 60000)
  const isWaitingLong = order.status !== 'entregue' && waitingMin >= WAIT_WARNING_MIN

  return (
    <article
      className={`order-card order-card--${order.status} ${isNew ? 'order-card--new' : ''}`}
      onClick={() => isNew && onSeen(order.id)}
    >
      {isNew && <span className="order-card__new-badge">NOVO</span>}

      <header className="order-card__header">
        <span className="order-card__table" title={`Mesa ${order.table?.numero ?? '?'}`}>
          {order.table?.numero ?? '?'}
        </span>
        <div className="order-card__meta">
          <span className={`order-card__time ${isWaitingLong ? 'order-card__time--warning' : ''}`}>
            {elapsedLabel(order.criado_em, now)}
          </span>
          {order.status === 'entregue' && (
            <span className="status-pill status-pill--entregue">{ORDER_STATUS_LABEL.entregue}</span>
          )}
        </div>
      </header>

      <ul className="order-card__items">
        {order.items.map((item) => (
          <li key={item.id} className="order-card__item">
            <div className="order-card__item-row">
              <span className="order-card__item-qty">{item.quantidade}×</span>
              <span className="order-card__item-name">{item.nome_item}</span>
            </div>
            {item.modifiers_selecionados.length > 0 && (
              <p className="order-card__item-mods">
                {item.modifiers_selecionados.map((m) => m.option_nome).join(', ')}
              </p>
            )}
            {item.observacoes && <p className="order-card__item-obs">Obs: {item.observacoes}</p>}
          </li>
        ))}
      </ul>

      <footer className="order-card__footer">
        <div className="order-card__summary">
          <span>
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </span>
          <span>{formatCHF(total)}</span>
        </div>
        {nextLabel && (
          <button
            className="btn btn-primary btn-block order-card__advance"
            onClick={(e) => {
              e.stopPropagation()
              onSeen(order.id)
              onAdvance(order)
            }}
          >
            {nextLabel} →
          </button>
        )}
      </footer>
    </article>
  )
}
