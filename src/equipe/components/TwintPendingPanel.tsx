import { useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import type { ReportOrder } from '@shared/types'
import { formatCHF, formatSelectedOptionLabel } from '@shared/format'

interface Props {
  orders: ReportOrder[]
  onConfirm: (orderId: string) => Promise<void>
}

/**
 * Pedidos pagos por Twint, esperando a equipe conferir o recebimento no
 * celular do caixa. Mesmo esquema do CashPendingPanel (botão flutuante que
 * não reserva espaço no layout), mas sem conferência de troco — Twint é
 * valor exato, então basta confirmar que o pagamento chegou.
 */
export default function TwintPendingPanel({ orders, onConfirm }: Props) {
  const [open, setOpen] = useState(false)

  if (orders.length === 0) return null

  return (
    <>
      <button className="twint-pending-fab" onClick={() => setOpen(true)}>
        <Smartphone size={20} strokeWidth={2.5} aria-hidden />
        {orders.length} {orders.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'} pagamento no Twint
      </button>

      {open && (
        <div className="admin-modal-overlay" onClick={() => setOpen(false)}>
          <div className="admin-modal cash-pending-modal" onClick={(e) => e.stopPropagation()}>
            <header className="admin-modal__header">
              <h2>Pagamento por Twint</h2>
              <button className="admin-modal__close" onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={20} strokeWidth={2} />
              </button>
            </header>
            <div className="cash-pending-modal__list">
              {orders.map((order) => (
                <TwintPendingCard key={order.id} order={order} onConfirm={onConfirm} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface CardProps {
  order: ReportOrder
  onConfirm: Props['onConfirm']
}

function TwintPendingCard({ order, onConfirm }: CardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = Number(order.valor_pago ?? 0)
  const itemCount = order.items.reduce((sum, i) => sum + i.quantidade, 0)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    try {
      await onConfirm(order.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar.')
      setSaving(false)
    }
  }

  return (
    <article className="cash-pending-card twint-pending-card">
      <header className="cash-pending-card__header">
        <div>
          <strong className="cash-pending-card__customer">{order.nome_cliente ?? '—'}</strong>
          <span className="cash-pending-card__meta">
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </span>
        </div>
        <span className="cash-pending-card__total">{formatCHF(total)}</span>
      </header>

      <ul className="order-card__items">
        {order.items.map((item) => (
          <li key={item.id} className="order-card__item">
            <div className="order-card__item-row">
              <span className="order-card__item-qty">{item.quantidade}×</span>
              <span className="order-card__item-name">{item.nome_item}</span>
            </div>
            {item.descricao_item && <p className="order-card__item-recipe">{item.descricao_item}</p>}
            {item.modifiers_selecionados.length > 0 && (
              <p className="order-card__item-mods">
                {item.modifiers_selecionados.map((m) => formatSelectedOptionLabel(m.option_nome, m.quantidade)).join(', ')}
              </p>
            )}
            {item.observacoes && <p className="order-card__item-obs">Obs: {item.observacoes}</p>}
          </li>
        ))}
      </ul>

      {error && <p className="admin-form__error">{error}</p>}

      <button className="btn btn-primary" disabled={saving} onClick={handleConfirm}>
        {saving ? 'Confirmando…' : 'Confirmar recebimento'}
      </button>
    </article>
  )
}
