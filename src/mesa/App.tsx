import { useEffect, useState } from 'react'
import DashboardScreen from './components/DashboardScreen'
import OrderSummaryScreen from './components/OrderSummaryScreen'
import ConfirmationScreen from './components/ConfirmationScreen'
import PaymentStatusScreen from './components/PaymentStatusScreen'
import Screensaver from './components/Screensaver'
import { useKeepFullscreen } from './useFullscreen'
import { useLanguage } from './i18n/LanguageContext'
import type { CartItem } from './types'

type View =
  | 'dashboard'
  | 'resumo'
  | 'awaiting_tap'
  | 'confirming_payment'
  | 'payment_failed'
  | 'confirmation'

/** Quanto tempo o totem espera o cliente aproximar o cartão antes de desistir. */
const TAP_TIMEOUT_MS = 120_000
const TAP_POLL_INTERVAL_MS = 2_000

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
    return status !== null && status !== 'aguardando_pagamento' && status !== 'cancelado'
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

  async function handleSubmit(customerName: string, tip: number) {
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

    if (view === 'confirmation') {
      return (
        <ConfirmationScreen
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

  // Nada de descanso de tela durante o pagamento: cobrir a tela enquanto o
  // cliente aproxima o cartão, ou enquanto ele lê por que a cobrança falhou,
  // seria péssimo.
  const PAYMENT_VIEWS: View[] = ['awaiting_tap', 'confirming_payment', 'payment_failed']

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
