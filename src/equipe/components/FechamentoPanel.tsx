import { useMemo, useState } from 'react'
import type { OrderWithItems } from '@shared/types'
import { formatCHF } from '@shared/format'
import { dateKeyToDate, isoToDateKey } from '../dateUtils'

interface Props {
  orders: OrderWithItems[]
  onCloseSelected: (selected: OrderWithItems[]) => void
  fechamentoAutomatico: boolean
  onToggleFechamentoAutomatico: (ativo: boolean) => void
}

export default function FechamentoPanel({
  orders,
  onCloseSelected,
  fechamentoAutomatico,
  onToggleFechamentoAutomatico,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const map = new Map<string, OrderWithItems[]>()
    for (const o of orders) {
      const key = isoToDateKey(o.criado_em)
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [orders])

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleDay(dayOrders: OrderWithItems[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = dayOrders.every((o) => next.has(o.id))
      for (const o of dayOrders) {
        if (allSelected) next.delete(o.id)
        else next.add(o.id)
      }
      return next
    })
  }

  const selected = orders.filter((o) => selectedIds.has(o.id))

  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Fechamento</h2>
        <button
          className="btn btn-primary admin-add-btn"
          disabled={selected.length === 0}
          onClick={() => onCloseSelected(selected)}
        >
          Fechar selecionados ({selected.length})
        </button>
      </header>

      <p className="admin-form__hint admin-fechamento__hint">
        Pedidos pagos no cartão ou em dinheiro confirmado ficam aqui até serem fechados — o fechamento dá baixa nos
        insumos conforme a composição do produto e as misturas escolhidas. O quadro de pedidos da cozinha não muda.
      </p>

      <label className="admin-fechamento__auto">
        <span>
          <strong>Fechamento automático</strong>
          <span className="admin-form__hint">Dá baixa no estoque assim que o pedido é confirmado, sem esperar a revisão manual.</span>
        </span>
        <span className="admin-toggle">
          <input
            type="checkbox"
            checked={fechamentoAutomatico}
            onChange={(e) => onToggleFechamentoAutomatico(e.target.checked)}
          />
          <span className="admin-toggle__track">
            <span className="admin-toggle__thumb" />
          </span>
        </span>
      </label>

      <div className="admin-panel__body admin-product-list">
        {orders.length === 0 && <p className="admin-panel__empty">Nenhum pedido pendente de fechamento.</p>}

        {groups.map(([dayKey, dayOrders]) => (
          <div key={dayKey} className="admin-fechamento-day">
            <label className="admin-fechamento-day__header">
              <input
                type="checkbox"
                checked={dayOrders.every((o) => selectedIds.has(o.id))}
                onChange={() => toggleDay(dayOrders)}
              />
              <strong>
                {dateKeyToDate(dayKey).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                })}
              </strong>
              <span className="admin-product-row__category">
                {dayOrders.length} {dayOrders.length === 1 ? 'pedido' : 'pedidos'}
              </span>
            </label>

            {dayOrders.map((order) => {
              const total = order.items.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0) + order.gorjeta
              return (
                <label key={order.id} className="admin-product-row admin-fechamento-order">
                  <input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => toggle(order.id)} />
                  <div className="admin-product-row__info">
                    <div className="admin-product-row__title">
                      <strong>{order.nome_cliente ?? '—'}</strong>
                      <span className="admin-product-row__category">{order.forma_pagamento ?? order.status}</span>
                    </div>
                    <p className="admin-product-row__desc">
                      {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} · {formatCHF(total)}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
