import { useEffect, useState } from 'react'
import DashboardScreen from './components/DashboardScreen'
import OrderSummaryScreen from './components/OrderSummaryScreen'
import ConfirmationScreen from './components/ConfirmationScreen'
import PaymentStatusScreen from './components/PaymentStatusScreen'
import Screensaver from './components/Screensaver'
import { useKeepFullscreen } from './useFullscreen'
import { useLanguage } from './i18n/LanguageContext'
import type { CartItem, PaymentMethod } from './types'

type View =
  | 'dashboard'
  | 'resumo'
  | 'awaiting_tap'
  | 'confirming_payment'
  | 'payment_failed'
  | 'awaiting_cash'
  | 'cash_timeout'
  | 'confirmation'

/** Quanto tempo o totem espera o cliente aproximar o cartão antes de desistir. */
const TAP_TIMEOUT_MS = 120_000
/**
 * O painel da equipe só sabe que um pedido foi pago quando este totem grava
 * `recebido` no banco — a SumUp não nos avisa sozinha, alguém tem que
 * perguntar. 1s (em vez de 2s) é o meio-termo: rápido o bastante pra não se
 * notar no balcão, sem virar um tambor de pedidos por segundo num totem só.
 */
const TAP_POLL_INTERVAL_MS = 1_000
/**
 * Quanto o totem espera a equipe confirmar o troco no caixa. Bem mais longo
 * que o do cartão: ali quem decide é o leitor, aqui é gente ocupada — pode
 * haver fila no caixa antes de alguém digitar o valor.
 */
const CASH_TIMEOUT_MS = 600_000
const CASH_POLL_INTERVAL_MS = 3_000

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [cart, setCart] = useState<CartItem[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null)
  const { t } = useLanguage()

  useKeepFullscreen()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderId = params.get('pedido')
    if (!orderId) return
    window.history.replaceState(null, '', window.location.pathname)
    setConfirmingOrderId(orderId)
    confirmPayment(orderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAddToCart(item: CartItem) {
    setCart((prev) => [...prev, item])
  }

  function handleChangeQuantity(cartId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.cartId === cartId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0),
    )
  }

  function handleRemove(cartId: string) {
    setCart((prev) => prev.filter((i) => i.cartId !== cartId))
  }

  /** Pergunta ao servidor em que pé está o pagamento. Só ele decide. */
  async function fetchPaymentStatus(orderId: string): Promise<string | null> {
    const res = await fetch('/api/sumup-confirm-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const data = await res.json()
    return res.ok && typeof data.status === 'string' ? data.status : null
  }

  function isPaid(status: string | null): boolean {
    return (
      status !== null &&
      status !== 'aguardando_pagamento' &&
      status !== 'aguardando_dinheiro' &&
      status !== 'cancelado'
    )
  }

  /** Só lê o status do pedido — quem muda é a equipe, confirmando o troco no painel. */
  async function fetchOrderStatus(orderId: string): Promise<string | null> {
    const res = await fetch(`/api/order-status?orderId=${encodeURIComponent(orderId)}`)
    const data = await res.json()
    return res.ok && typeof data.status === 'string' ? data.status : null
  }

  async function confirmPayment(orderId: string) {
    setView('confirming_payment')
    try {
      if (isPaid(await fetchPaymentStatus(orderId))) {
        setCart([])
        setView('confirmation')
      } else {
        setView('payment_failed')
      }
    } catch {
      setView('payment_failed')
    }
  }

  /**
   * Maquininha: a cobrança já está na tela do aparelho, então aqui só ficamos
   * perguntando ao servidor até o cliente aproximar o cartão (ou desistir).
   */
  async function waitForTap(orderId: string) {
    setConfirmingOrderId(orderId)
    setView('awaiting_tap')
    // Libera o botão do resumo: se o cliente voltar para lá depois, ele não
    // pode estar travado em "Enviando…".
    setSending(false)
    const deadline = Date.now() + TAP_TIMEOUT_MS

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, TAP_POLL_INTERVAL_MS))
      let status: string | null = null
      try {
        status = await fetchPaymentStatus(orderId)
      } catch {
        // Falha de rede momentânea não encerra a espera: o cliente pode estar
        // com o cartão na mão. Tenta de novo no próximo ciclo.
        continue
      }
      if (isPaid(status)) {
        setCart([])
        setView('confirmation')
        return
      }
      if (status === 'cancelado') break
    }
    setView('payment_failed')
  }

  /**
   * Dinheiro: o pedido já está criado como `aguardando_dinheiro`; quem o tira
   * dali é a equipe, conferindo o troco no painel — aqui só ficamos
   * perguntando ao servidor até isso acontecer (ou o cliente desistir).
   */
  async function waitForCash(orderId: string) {
    setConfirmingOrderId(orderId)
    setView('awaiting_cash')
    setSending(false)
    const deadline = Date.now() + CASH_TIMEOUT_MS

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CASH_POLL_INTERVAL_MS))
      let status: string | null = null
      try {
        status = await fetchOrderStatus(orderId)
      } catch {
        continue
      }
      if (isPaid(status)) {
        setCart([])
        setView('confirmation')
        return
      }
      if (status === 'cancelado') break
    }
    setView('cash_timeout')
  }

  /**
   * Traduz a falha que o servidor devolveu. Ele responde com um código, não
   * com a frase: a mensagem pronta chegava sempre em português, e aparecia
   * assim para um cliente lendo o cardápio em alemão. Código desconhecido —
   * ou resposta sem código — cai no aviso genérico, que também é traduzido.
   */
  function errorMessage(code: unknown): string {
    if (code === 'reader_unavailable') return t('readerUnavailableError')
    if (code === 'payment_start_failed') return t('paymentStartError')
    return t('genericOrderError')
  }

  async function handleSubmit(customerName: string, tip: number, paymentMethod: PaymentMethod) {
    if (cart.length === 0 || !customerName.trim()) return
    setSending(true)
    setSendError(null)

    const itemsPayload = cart.map((item) => ({
      menu_item_id: item.menuItem.id,
      nome_item: item.menuItem.nome,
      quantidade: item.quantidade,
      observacoes: item.observacoes || null,
      modifiers_selecionados: item.selectedOptions,
      preco_unitario: item.unitPrice,
    }))

    if (paymentMethod === 'dinheiro') {
      try {
        const res = await fetch('/api/create-cash-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsPayload, customerName, tip }),
        })
        const data = await res.json()
        if (!res.ok || !data.orderId) {
          setSendError(errorMessage(data?.code))
          setSending(false)
          return
        }
        await waitForCash(data.orderId)
      } catch {
        setSendError(t('genericOrderError'))
        setSending(false)
      }
      return
    }

    try {
      const res = await fetch('/api/sumup-create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload, customerName, tip }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendError(errorMessage(data?.code))
        setSending(false)
        return
      }

      // A cobrança já está na tela da maquininha: é só esperar a aproximação.
      if (data.mode === 'reader' && data.orderId) {
        await waitForTap(data.orderId)
        return
      }

      if (!data.hostedCheckoutUrl) {
        setSendError(errorMessage(data?.code))
        setSending(false)
        return
      }
      window.location.href = data.hostedCheckoutUrl
    } catch {
      setSendError(t('paymentStartError'))
      setSending(false)
    }
  }

  function currentScreen() {
    if (view === 'awaiting_tap') {
      return <PaymentStatusScreen status="awaiting_tap" />
    }

    if (view === 'confirming_payment') {
      return <PaymentStatusScreen status="confirming" />
    }

    if (view === 'payment_failed') {
      return (
        <PaymentStatusScreen
          status="failed"
          onRetry={() => confirmingOrderId && confirmPayment(confirmingOrderId)}
          onBack={() => setView('dashboard')}
        />
      )
    }

    if (view === 'awaiting_cash') {
      return <PaymentStatusScreen status="awaiting_cash" />
    }

    if (view === 'cash_timeout') {
      return (
        <PaymentStatusScreen
          status="cash_timeout"
          onRetry={() => confirmingOrderId && waitForCash(confirmingOrderId)}
          onBack={() => setView('dashboard')}
        />
      )
    }

    if (view === 'confirmation') {
      return (
        <ConfirmationScreen
          orderId={confirmingOrderId}
          onNewOrder={() => {
            setView('dashboard')
          }}
        />
      )
    }

    if (view === 'resumo') {
      return (
        <>
          <OrderSummaryScreen
            items={cart}
            sending={sending}
            onConfirm={handleSubmit}
            onBack={() => {
              setSendError(null)
              setView('dashboard')
            }}
          />
          {sendError && (
            <div className="toast toast--error" role="alert">
              {sendError}
            </div>
          )}
        </>
      )
    }

    return (
      <DashboardScreen
        cart={cart}
        onAddToCart={handleAddToCart}
        onChangeQuantity={handleChangeQuantity}
        onRemove={handleRemove}
        onSubmit={() => {
          setSendError(null)
          setView('resumo')
        }}
      />
    )
  }

  // Nada de descanso de tela enquanto o cliente aproxima o cartão ou espera a
  // confirmação: cobrir a tela nesse meio-tempo seria péssimo.
  //
  // "payment_failed" e "cash_timeout" ficam de fora desta lista de propósito
  // — "awaiting_cash" chegou a entrar pelo mesmo motivo de "awaiting_tap",
  // mas sem nenhum outro jeito de sair da tela sozinho, um cliente que
  // desiste de esperar e vai embora (reação comum, ainda mais numa fila no
  // caixa) deixava o totem travado ali, sem forma de o próximo cliente
  // pedir, até a equipe notar. Os 90s + 3min do próprio descanso de tela já
  // são folga de sobra para quem ficou esperando: ao primeiro toque a tela
  // desperta normalmente, como em qualquer outra — o pedido continua
  // pendente no painel da equipe, e quem confirma o troco tira ele dali.
  const PAYMENT_VIEWS: View[] = ['awaiting_tap', 'confirming_payment', 'awaiting_cash']

  return (
    <>
      {currentScreen()}
      <Screensaver
        enabled={!PAYMENT_VIEWS.includes(view)}
        onAbandoned={() => {
          // Ninguém voltou: a mesa está livre para o próximo. Volta ao cardápio
          // junto porque esvaziar sozinho poderia deixar alguém parado num
          // resumo de pedido sem nenhum item.
          setCart([])
          setSendError(null)
          setView('dashboard')
        }}
      />
    </>
  )
}
