import { useEffect, useMemo, useState } from 'react'
import { ChartColumn, LogOut, UtensilsCrossed } from 'lucide-react'
import type { OrderStatus, OrderWithItems } from '@shared/types'
import { useOrders } from './hooks/useOrders'
import { useAuth } from './hooks/useAuth'
import OrderCard from './components/OrderCard'
import DateStrip from './components/DateStrip'
import MenuManager from './components/MenuManager'
import LoginScreen from './components/LoginScreen'
import ReportsPanel from './components/ReportsPanel'
import { toDateKey, toMonthKey } from './dateUtils'

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: 'recebido', label: 'Recebido' },
  { status: 'em_preparo', label: 'Em preparo' },
  { status: 'pronto', label: 'Pronto' },
]

type View = 'board' | 'history' | 'menu' | 'reports'

export default function App() {
  const { session, user, loading: authLoading, signIn, signOut } = useAuth()
  const [now, setNow] = useState(new Date())
  const [view, setView] = useState<View>('board')
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()))
  const [viewedMonthKey, setViewedMonthKey] = useState(() => toMonthKey(new Date()))

  const { orders, orderCountByDate, loading, error, newOrderIds, markSeen, advanceStatus } = useOrders(
    selectedDateKey,
    viewedMonthKey,
  )

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
  // Cardápio e relatórios trazem a própria navegação de período; só as duas
  // telas de pedido usam o calendário e a carga do quadro.
  const showOrders = view === 'board' || view === 'history'

  if (authLoading) {
    return (
      <div className="login-screen">
        <p className="equipe-app__status">Verificando sessão…</p>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen onSignIn={signIn} />
  }

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
        <nav className="brand-banner__nav">
          <button
            className={`btn btn-outline btn-outline--dark ${view === 'reports' ? 'btn-outline--dark-active' : ''}`}
            onClick={() => setView((v) => (v === 'reports' ? 'board' : 'reports'))}
          >
            <ChartColumn size={16} strokeWidth={2} aria-hidden />
            Relatórios
          </button>
          <button
            className={`btn btn-outline btn-outline--dark ${view === 'menu' ? 'btn-outline--dark-active' : ''}`}
            onClick={() => setView((v) => (v === 'menu' ? 'board' : 'menu'))}
          >
            <UtensilsCrossed size={16} strokeWidth={2} aria-hidden />
            Cardápio
          </button>
          <button
            className={`btn btn-outline btn-outline--dark ${view === 'history' ? 'btn-outline--dark-active' : ''}`}
            onClick={() => setView((v) => (v === 'history' ? 'board' : 'history'))}
          >
            {view === 'history' ? '← Quadro' : `Entregues (${byStatus.entregue.length})`}
          </button>
          <button className="btn btn-outline btn-outline--dark" onClick={signOut} title={user?.email ?? ''}>
            <LogOut size={16} strokeWidth={2} aria-hidden />
            Sair
          </button>
        </nav>
        <span
          className={`realtime-dot ${error ? 'realtime-dot--off' : 'realtime-dot--on'}`}
          title={error ?? 'Conectado em tempo real'}
        />
      </header>

      {showOrders && (
        <DateStrip
          selectedDateKey={selectedDateKey}
          onSelect={setSelectedDateKey}
          monthKey={viewedMonthKey}
          onMonthChange={setViewedMonthKey}
          orderCountByDate={orderCountByDate}
        />
      )}

      {view === 'menu' && <MenuManager accessToken={session.access_token} currentUserId={user!.id} />}

      {view === 'reports' && <ReportsPanel />}

      {showOrders && error && <p className="equipe-app__error">Erro ao carregar pedidos: {error}</p>}
      {showOrders && loading && <p className="equipe-app__status">Carregando pedidos…</p>}

      {!loading && view === 'history' && (
        <main className="history-list">
          {byStatus.entregue.length === 0 && <p className="equipe-app__status">Nenhum pedido entregue neste dia.</p>}
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

      {!loading && view === 'board' && (
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
