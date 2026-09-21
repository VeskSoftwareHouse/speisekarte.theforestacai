import { useEffect, useMemo, useRef, useState } from 'react'
import type { OrderStatus, OrderWithItems } from '@shared/types'
import { formatCHF } from '@shared/format'
import { useOrders } from './hooks/useOrders'
import { useCopoProntoIngredientes } from './hooks/useCopoProntoIngredientes'
import { useCashPendingOrders } from './hooks/useCashPendingOrders'
import { useTwintPendingOrders } from './hooks/useTwintPendingOrders'
import { useAuth } from './hooks/useAuth'
import OrderCard from './components/OrderCard'
import ComandaPrint from './components/ComandaPrint'
import ConfirmDialog from './components/ConfirmDialog'
import CashPendingPanel from './components/CashPendingPanel'
import TwintPendingPanel from './components/TwintPendingPanel'
import DateStrip from './components/DateStrip'
import MenuManager from './components/MenuManager'
import EstoqueManager from './components/EstoqueManager'
import AssistantChat from './components/AssistantChat'
import LoginScreen from './components/LoginScreen'
import ReportsPanel from './components/ReportsPanel'
import PanelHeader, { type PanelTab } from './components/PanelHeader'
import { toDateKey, toMonthKey } from './dateUtils'

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: 'recebido', label: 'Recebido' },
  { status: 'em_preparo', label: 'Em preparo' },
  { status: 'pronto', label: 'Pronto' },
]

export default function App() {
  const { session, user, loading: authLoading, signIn, signOut } = useAuth()
  const [now, setNow] = useState(new Date())
  const [tab, setTab] = useState<PanelTab>('pedidos')
  // "Entregues" é um recorte dos pedidos do dia, não uma quarta seção do
  // painel: mora aqui dentro, ao lado do calendário que escolhe o dia.
  const [showDelivered, setShowDelivered] = useState(false)
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()))
  const [viewedMonthKey, setViewedMonthKey] = useState(() => toMonthKey(new Date()))

  const { orders, orderCountByDate, loading, error, realtimeConnected, newOrderIds, markSeen, advanceStatus, excluirPedido } =
    useOrders(selectedDateKey, viewedMonthKey)
  const { orders: cashPendingOrders, confirmCash } = useCashPendingOrders(user?.id ?? '')
  const { orders: twintPendingOrders, confirmTwint } = useTwintPendingOrders(user?.id ?? '')
  const ingredientesCopoPronto = useCopoProntoIngredientes()
  // Confirmação antes de excluir um pedido (ex: pedido de teste) — nunca
  // apaga direto no clique da lixeira, ver OrderCard.
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<OrderWithItems | null>(null)
  // Comanda em impressão — ver ComandaPrint. `body.printing-comanda` some com
  // o resto da tela só durante o print (CSS em equipe.css), então o quadro
  // kanban não pisca escondido enquanto a pessoa só está olhando a tela.
  const [printOrder, setPrintOrder] = useState<OrderWithItems | null>(null)

  useEffect(() => {
    if (!printOrder) return
    // O React já commitou a comanda no DOM (via ComandaPrint) antes de rodar
    // este efeito, então dá pra imprimir direto — sem esperar mais nenhum
    // tick.
    document.body.classList.add('printing-comanda')
    const handleAfterPrint = () => setPrintOrder(null)
    window.addEventListener('afterprint', handleAfterPrint)
    window.print()
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint)
      document.body.classList.remove('printing-comanda')
    }
  }, [printOrder])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(id)
  }, [])

  // Sem isto, o quadro ficava preso no dia em que a aba foi aberta: um pedido
  // pago logo depois da meia-noite não batia no filtro de "hoje" e sumia do
  // quadro sem nenhum aviso, até alguém notar e trocar o dia na mão. Só
  // adianta o dia selecionado quando ele já era "hoje" — se a equipe navegou
  // para outro dia de propósito (conferir o histórico), a virada da meia-noite
  // não deve puxar a tela para longe do que ela escolheu olhar.
  const todayKeyRef = useRef(toDateKey(now))
  useEffect(() => {
    const newTodayKey = toDateKey(now)
    if (newTodayKey === todayKeyRef.current) return
    setSelectedDateKey((prev) => (prev === todayKeyRef.current ? newTodayKey : prev))
    todayKeyRef.current = newTodayKey
  }, [now])

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
  const deliveredCount = byStatus.entregue.length

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
      <PanelHeader
        tab={tab}
        onTabChange={setTab}
        activeCount={activeCount}
        connected={realtimeConnected && !error}
        connectionError={error ?? (!realtimeConnected ? 'Conexão em tempo real caiu — reconectando…' : null)}
        userEmail={user?.email}
        onSignOut={signOut}
      />

      <AssistantChat accessToken={session.access_token} />

      {tab === 'cardapio' && <MenuManager accessToken={session.access_token} currentUserId={user!.id} />}

      {tab === 'estoque' && <EstoqueManager currentUserId={user!.id} />}

      {tab === 'relatorios' && <ReportsPanel />}

      {tab === 'pedidos' && (
        <>
          <DateStrip
            selectedDateKey={selectedDateKey}
            onSelect={setSelectedDateKey}
            monthKey={viewedMonthKey}
            onMonthChange={setViewedMonthKey}
            orderCountByDate={orderCountByDate}
            trailing={
              <div className="orders-switch" role="tablist" aria-label="Pedidos do dia">
                <button
                  role="tab"
                  aria-selected={!showDelivered}
                  className={`orders-switch__item ${!showDelivered ? 'orders-switch__item--active' : ''}`}
                  onClick={() => setShowDelivered(false)}
                >
                  Em andamento<span className="orders-switch__count">{activeCount}</span>
                </button>
                <button
                  role="tab"
                  aria-selected={showDelivered}
                  className={`orders-switch__item ${showDelivered ? 'orders-switch__item--active' : ''}`}
                  onClick={() => setShowDelivered(true)}
                >
                  Entregues<span className="orders-switch__count">{deliveredCount}</span>
                </button>
              </div>
            }
          />

          <div className="loading-rail">{loading && <span className="loading-rail__bar" aria-hidden />}</div>

          {error && <p className="equipe-app__error">Erro ao carregar pedidos: {error}</p>}

          <CashPendingPanel orders={cashPendingOrders} onConfirm={confirmCash} />
          <TwintPendingPanel orders={twintPendingOrders} onConfirm={confirmTwint} />

          {showDelivered && (
            <main className="history-list">
              {!loading && deliveredCount === 0 && (
                <p className="equipe-app__status">Nenhum pedido entregue neste dia.</p>
              )}
              {byStatus.entregue.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isNew={false}
                  now={now}
                  onAdvance={advanceStatus}
                  onSeen={markSeen}
                  onRequestDelete={setDeleteOrderTarget}
                  onPrint={setPrintOrder}
                  ingredientesCopoPronto={ingredientesCopoPronto}
                />
              ))}
            </main>
          )}

          {!showDelivered && (
            <main className="kanban">
              {COLUMNS.map((col) => (
                <section key={col.status} className="kanban-column">
                  <header className={`kanban-column__header kanban-column__header--${col.status}`}>
                    <h2>{col.label}</h2>
                    <span className="kanban-column__count">{byStatus[col.status].length}</span>
                  </header>
                  <div className="kanban-column__body">
                    {!loading && byStatus[col.status].length === 0 && (
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
                        onRequestDelete={setDeleteOrderTarget}
                        onPrint={setPrintOrder}
                        ingredientesCopoPronto={ingredientesCopoPronto}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </main>
          )}

          {deleteOrderTarget && (
            <ConfirmDialog
              title="Excluir pedido?"
              message={`O pedido de "${deleteOrderTarget.nome_cliente ?? 'sem nome'}" (${formatCHF(
                deleteOrderTarget.items.reduce((soma, i) => soma + i.preco_unitario * i.quantidade, 0),
              )}) some da tela e dos relatórios. Não dá pra desfazer — use só pra pedido de teste.`}
              confirmLabel="Excluir pedido"
              onCancel={() => setDeleteOrderTarget(null)}
              onConfirm={() => {
                excluirPedido(deleteOrderTarget, user?.id ?? null)
                setDeleteOrderTarget(null)
              }}
            />
          )}
        </>
      )}

      <ComandaPrint order={printOrder} />
    </div>
  )
}
