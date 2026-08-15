/**
 * Pagamento por aproximação (Tap to Pay) usando o "Payment Switch" da SumUp.
 *
 * O App da Mesa roda no navegador do tablet e, por isso, não consegue ler
 * cartões por NFC sozinho — acesso ao hardware de pagamento é exclusivo de app
 * nativo. O caminho oficial para web é abrir o app da SumUp por URL scheme: ele
 * assume a tela, cobra por aproximação e devolve o controle na URL de
 * `callback`, já com o resultado nos parâmetros `smp-*`.
 *
 * Esses parâmetros de volta são só uma dica para a interface: a confirmação
 * real é feita no servidor, em /api/sumup-confirm-payment, consultando a
 * transação pelo `foreign-tx-id` (= id do pedido).
 *
 * Requisitos no tablet: Android 11+ com NFC, app da SumUp instalado e logado na
 * conta do estabelecimento.
 */

const AFFILIATE_KEY = import.meta.env.VITE_SUMUP_AFFILIATE_KEY as string | undefined

/**
 * Sem a affiliate key o app cai no checkout hospedado (cliente digita o cartão
 * no navegador), que é o comportamento anterior.
 */
export function isTapToPayEnabled(): boolean {
  return Boolean(AFFILIATE_KEY)
}

interface TapToPayParams {
  orderId: string
  total: number
  customerName: string
}

export function buildTapToPayUrl({ orderId, total, customerName }: TapToPayParams): string {
  const params = new URLSearchParams({
    'affiliate-key': AFFILIATE_KEY as string,
    total: total.toFixed(2),
    currency: 'CHF',
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
