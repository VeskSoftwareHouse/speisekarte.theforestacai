/**
 * Pagamento com cartão presencial pela SumUp.
 *
 * Existem dois caminhos, porque o navegador sozinho não consegue cobrar por
 * aproximação — ler cartão por NFC é exclusividade de app nativo:
 *
 * 1. Casca nativa (android/) — o cardápio roda dentro de um WebView e chama o
 *    SDK de Tap to Pay pela ponte `AndroidTapToPay`. É o único jeito de o
 *    cliente aproximar o cartão no próprio tablet.
 * 2. Payment Switch (`sumupmerchant://`) — abre o app da SumUp instalado.
 *    Serve como alternativa quando o cardápio é aberto no navegador, mas a
 *    SumUp **não expõe o Tap to Pay por aqui**: só maquininha por Bluetooth.
 *    Ver github.com/sumup/sumup-android-api/issues/38.
 *
 * Sem nenhum dos dois, o app cai no checkout hospedado (cliente digita o
 * cartão no navegador), que é o comportamento original.
 */

const AFFILIATE_KEY = import.meta.env.VITE_SUMUP_AFFILIATE_KEY as string | undefined

// TEMPORÁRIO (testes): cobrando em BRL. A conta e os preços do cardápio são
// suíços, então antes de abrir para o público isto volta para 'CHF'.
// O mesmo valor está em api/sumup-create-checkout.ts — trocar os dois juntos.
const CURRENCY = 'BRL'

// Só o Brasil e o Chile exigem dizer se o cartão é crédito ou débito; na Suíça
// o próprio cartão define e este valor é ignorado. Enquanto os testes rodam em
// BRL, a escolha está fixa aqui — se precisar testar com crédito, troque para
// 'CREDIT' (ou peça a tela de escolha).
const PROCESS_CARD_AS = 'DEBIT'

interface NativeBridge {
  isAvailable: () => string
  startPayment: (payload: string) => void
}

interface NativeResult {
  status: 'success' | 'failed' | 'canceled' | 'unknown'
  txCode: string | null
  message: string | null
}

declare global {
  interface Window {
    AndroidTapToPay?: NativeBridge
    __onTapToPayResult?: (result: NativeResult) => void
  }
}

/** true quando o cardápio está rodando dentro da casca nativa do totem. */
export function isNativeTapToPayAvailable(): boolean {
  return window.AndroidTapToPay?.isAvailable() === 'true'
}

/** Sem a affiliate key, o app usa o checkout hospedado. */
export function isPaymentSwitchEnabled(): boolean {
  return Boolean(AFFILIATE_KEY)
}

/** Qualquer forma de cobrança presencial está disponível? */
export function isCardPresentEnabled(): boolean {
  return isNativeTapToPayAvailable() || isPaymentSwitchEnabled()
}

interface PaymentParams {
  orderId: string
  total: number
  customerName: string
}

/**
 * Cobra por aproximação no próprio tablet. Resolve quando o SDK termina — o
 * resultado aqui é só para a interface reagir; quem confirma o pedido de
 * verdade é /api/sumup-confirm-payment, consultando a transação no servidor.
 */
export function startNativeTapToPay({ orderId, total }: PaymentParams): Promise<NativeResult> {
  return new Promise((resolve) => {
    window.__onTapToPayResult = (result) => {
      delete window.__onTapToPayResult
      resolve(result)
    }
    window.AndroidTapToPay?.startPayment(
      JSON.stringify({ orderId, total, processCardAs: PROCESS_CARD_AS }),
    )
  })
}

/** URL que entrega a cobrança ao app da SumUp instalado (maquininha Bluetooth). */
export function buildPaymentSwitchUrl({ orderId, total, customerName }: PaymentParams): string {
  const params = new URLSearchParams({
    'affiliate-key': AFFILIATE_KEY as string,
    total: total.toFixed(2),
    currency: CURRENCY,
    title: `${customerName} — Forest Açaí`.slice(0, 80),
    // Amarra a transação da SumUp ao nosso pedido, para o servidor conseguir
    // confirmar o pagamento depois sem depender do que voltou na URL.
    'foreign-tx-id': orderId,
    callback: `${window.location.origin}/mesa/?pedido=${orderId}`,
    // Totem: volta sozinho para o cardápio em vez de esperar alguém tocar em
    // "OK" na tela de sucesso do app da SumUp.
    'skip-screen-success': 'true',
  })
  return `sumupmerchant://pay/1.0?${params.toString()}`
}
