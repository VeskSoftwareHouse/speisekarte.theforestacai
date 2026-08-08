import { useEffect, useMemo, useState } from 'react'
import type { OrderStatus, OrderWithItems } from '@shared/types'
import { useOrders } from './hooks/useOrders'
import OrderCard from './components/OrderCard'

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: 'recebido', label: 'Recebido' },
  { status: 'em_preparo', label: 'Em preparo' },
  { status: 'pronto', label: 'Pronto' },
]

export default function App() {
  const { orders, loading, error, newOrderIds, markSeen, advanceStatus } = useOrders()
  const [now, setNow] = useState(new Date())
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])

  const byStatus = useMemo(() => {
    const map: Record<OrderStatus, OrderWithItems[]> = {
      recebido: [],
      em_preparo: [],
      pronto: [],
      entregue: [],
    }
    for (const order of orders) map[order.status].push(order)
    return map
  }, [orders])

  const activeCount = orders.length - byStatus.entregue.length

  return (
    <div className="equipe-app">
      <header className="brand-banner">
        <img src="/brand/logo.png" alt="Forest Açaí" className="brand-banner__logo" />
        <div className="brand-banner__info">
          <p className="brand-banner__eyebrow">Painel da Equipe</p>
          <h1 className="brand-banner__value">
            Pedidos {activeCount > 0 && <small>{activeCount} ativos</small>}
          </h1>
        </div>
        <button className="btn btn-outline btn-outline--dark" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? '← Quadro' : `Entregues (${byStatus.entregue.length})`}
        </button>
        <span
          className={`realtime-dot ${error ? 'realtime-dot--off' : 'realtime-dot--on'}`}
          title={error ?? 'Conectado em tempo real'}
        />
      </header>

      {error && <p className="equipe-app__error">Erro ao carregar pedidos: {error}</p>}
      {loading && <p className="equipe-app__status">Carregando pedidos…</p>}

      {!loading && showHistory && (
        <main className="history-list">
          {byStatus.entregue.length === 0 && <p className="equipe-app__status">Nenhum pedido entregue ainda.</p>}
          {byStatus.entregue.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              isNew={false}
              now={now}
              onAdvance={advanceStatus}
              onSeen={markSeen}
            />
          ))}
        </main>
      )}

      {!loading && !showHistory && (
        <main className="kanban">
          {COLUMNS.map((col) => (
            <section key={col.status} className="kanban-column">
              <header className={`kanban-column__header kanban-column__header--${col.status}`}>
                <h2>{col.label}</h2>
                <span className="kanban-column__count">{byStatus[col.status].length}</span>
              </header>
              <div className="kanban-column__body">
                {byStatus[col.status].length === 0 && (
                  <p className="kanban-column__empty">Nenhum pedido</p>
                )}
                {byStatus[col.status].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isNew={newOrderIds.has(order.id)}
                    now={now}
                    onAdvance={advanceStatus}
                    onSeen={markSeen}
                  />
                ))}
              </div>
            </section>
          ))}
        </main>
      )}
    </div>
  )
}
