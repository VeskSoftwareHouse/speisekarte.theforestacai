import { useEffect, useState } from 'react'
import DashboardScreen from './components/DashboardScreen'
import OrderSummaryScreen from './components/OrderSummaryScreen'
import ConfirmationScreen from './components/ConfirmationScreen'
import PaymentStatusScreen from './components/PaymentStatusScreen'
import { useKeepFullscreen } from './useFullscreen'
import { useLanguage } from './i18n/LanguageContext'
import {
  buildPaymentSwitchUrl,
  isCardPresentEnabled,
  isNativeTapToPayAvailable,
  startNativeTapToPay,
} from './sumupTapToPay'
import type { CartItem } from './types'

type View = 'dashboard' | 'resumo' | 'confirming_payment' | 'payment_failed' | 'confirmation'

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

  async function confirmPayment(orderId: string) {
    setView('confirming_payment')
    try {
      const res = await fetch('/api/sumup-confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (res.ok && data.status && data.status !== 'aguardando_pagamento' && data.status !== 'cancelado') {
        setCart([])
        setView('confirmation')
      } else {
        setView('payment_failed')
      }
    } catch {
      setView('payment_failed')
    }
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

    const cardPresent = isCardPresentEnabled()

    try {
      const res = await fetch('/api/sumup-create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsPayload,
          customerName,
          tip,
          paymentMethod: cardPresent ? 'tap' : 'online',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendError(data?.error ?? t('genericOrderError'))
        setSending(false)
        return
      }

      if (cardPresent) {
        if (!data.orderId) {
          setSendError(data?.error ?? t('genericOrderError'))
          setSending(false)
          return
        }

        // Dentro da casca nativa: o SDK cobra por aproximação sem sair da tela.
        if (isNativeTapToPayAvailable()) {
          const result = await startNativeTapToPay({
            orderId: data.orderId,
            total: data.total,
            customerName,
          })
          if (result.status === 'canceled') {
            // Cliente desistiu: volta para o resumo em vez de mandá-lo para a
            // tela de "pagamento não confirmado".
            setSending(false)
            return
          }
          // Sucesso, falha ou resultado desconhecido: quem decide é o servidor.
          window.location.href = `/mesa/?pedido=${data.orderId}`
          return
        }

        // Fora dela: entrega ao app da SumUp instalado (maquininha Bluetooth),
        // que volta para /mesa/?pedido=<id> quando terminar.
        // Se o app não estiver instalado (ou recusar o link), abrir a URL não
        // dispara erro nenhum: a página simplesmente continua aberta e o cliente
        // ficaria preso no "Enviando…". Como o totem não tem atendente,
        // detectamos isso pelo fato de a aba continuar visível e liberamos a
        // tela de novo com uma mensagem.
        const handoff = window.setTimeout(() => {
          if (document.visibilityState === 'visible') {
            setSendError(t('tapToPayUnavailable'))
            setSending(false)
          }
        }, 3000)
        document.addEventListener('visibilitychange', () => window.clearTimeout(handoff), {
          once: true,
        })
        window.location.href = buildPaymentSwitchUrl({
          orderId: data.orderId,
          total: data.total,
          customerName,
        })
        return
      }

      if (!data.hostedCheckoutUrl) {
        setSendError(data?.error ?? t('genericOrderError'))
        setSending(false)
        return
      }
      window.location.href = data.hostedCheckoutUrl
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t('genericOrderError'))
      setSending(false)
    }
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
