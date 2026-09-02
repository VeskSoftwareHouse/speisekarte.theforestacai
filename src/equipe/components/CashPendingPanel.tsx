import { useState } from 'react'
import { Banknote } from 'lucide-react'
import type { ReportOrder } from '@shared/types'
import { formatCHF } from '@shared/format'
import CurrencyInput from '@shared/components/CurrencyInput'

interface Props {
  orders: ReportOrder[]
  onConfirm: (orderId: string, valorRecebidoDinheiro: number) => Promise<void>
}

/**
 * Fila de pedidos pagos em dinheiro, esperando a equipe conferir o troco no
 * caixa. Fica sempre visível no topo da aba Pedidos (não só numa aba
 * separada) porque, ao contrário do quadro da cozinha, aqui tem um cliente
 * parado esperando — some sozinha quando não há nenhum pendente.
 */
export default function CashPendingPanel({ orders, onConfirm }: Props) {
  if (orders.length === 0) return null

  return (
    <section className="cash-pending">
      <header className="cash-pending__header">
        <Banknote size={18} strokeWidth={2.5} aria-hidden />
        <h2>Pagamento em dinheiro</h2>
        <span className="cash-pending__count">{orders.length}</span>
      </header>
      <div className="cash-pending__list">
        {orders.map((order) => (
          <CashPendingCard key={order.id} order={order} onConfirm={onConfirm} />
        ))}
      </div>
    </section>
  )
}

interface CardProps {
  order: ReportOrder
  onConfirm: Props['onConfirm']
}

function CashPendingCard({ order, onConfirm }: CardProps) {
  const [valor, setValor] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = Number(order.valor_pago ?? 0)
  const troco = Math.round((valor - total) * 100) / 100
  const itemCount = order.items.reduce((sum, i) => sum + i.quantidade, 0)

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    try {
      await onConfirm(order.id, valor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar.')
      setSaving(false)
    }
  }

  return (
    <article className="cash-pending-card">
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
                {item.modifiers_selecionados.map((m) => m.option_nome).join(', ')}
              </p>
            )}
            {item.observacoes && <p className="order-card__item-obs">Obs: {item.observacoes}</p>}
          </li>
        ))}
      </ul>

      <div className="cash-pending-card__cash-row">
        <label className="cash-pending-card__field">
          <span>Valor recebido</span>
          <CurrencyInput value={valor} onChange={setValor} />
        </label>
        {/* Sem isto, o campo ainda em "0,00" não mostrava nada — o botão
            aparecia só apagado, sem dizer por quê, e parecia travado em vez
            de esperando o valor. Mostrar "faltam" desde o início deixa claro
            o que falta pra liberar, mesmo antes da equipe digitar algo. */}
        {troco > 0 ? (
          <p className="cash-pending-card__change">Troco: {formatCHF(troco)}</p>
        ) : troco === 0 ? (
          <p className="cash-pending-card__exact">Valor exato</p>
        ) : (
          <p className="cash-pending-card__missing">Faltam {formatCHF(-troco)}</p>
        )}
      </div>

      {error && <p className="admin-form__error">{error}</p>}

      <button className="btn btn-primary" disabled={valor < total || saving} onClick={handleConfirm}>
        {saving ? 'Confirmando…' : 'Confirmar e finalizar'}
      </button>
    </article>
  )
}
