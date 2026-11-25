const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE
const sumupAffiliateKey = process.env.SUMUP_AFFILIATE_KEY

// Moeda da cobrança. Tem de bater com a moeda da conta SumUp da loja: os
// preços do cardápio sempre foram francos, e durante os testes eles saíam
// cobrados em reais — o mesmo número, na moeda errada.
export const CURRENCY = 'CHF'

/**
 * Extrai o que a SumUp disse de errado. Ela não usa um formato só: às vezes é
 * `message`, às vezes `error_message`, às vezes uma lista em `errors`. Ler só
 * um deles fazia toda falha cair no texto genérico do totem, e a causa real
 * — a maquininha registrada em outra conta, por exemplo — nunca chegava a
 * ninguém.
 */
export function sumupError(data: any): string | null {
  if (!data) return null
  // `errors` chega das duas formas: lista, e objeto com `detail` — foi o que
  // uma recusa real de maquininha devolveu ({"errors":{"detail":"Bad Request"}}).
  const deErrors = Array.isArray(data.errors)
    ? data.errors[0]?.message ?? data.errors[0]?.detail
    : data.errors?.message ?? data.errors?.detail

  const candidato = data.message ?? data.error_message ?? data.error?.message ?? deErrors
  return typeof candidato === 'string' && candidato.trim() ? candidato : null
}

/**
 * Manda a cobrança para a maquininha pareada. Devolve `false` — sem lançar —
 * quando a SumUp recusa ou o aparelho não responde, e registra nos logs o que
 * ela disse. Não tenta outra forma de pagamento: a cobrança é na maquininha
 * ou não é.
 */
export async function startReaderCheckout(
  readerId: string,
  orderId: string,
  total: number,
  description: string,
): Promise<boolean> {
  try {
    const readerRes = await fetch(
      `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(sumupMerchantCode as string)}` +
        `/readers/${encodeURIComponent(readerId)}/checkout`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sumupApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          total_amount: {
            currency: CURRENCY,
            // `value` vai em unidades menores: 29.80 -> 2980 centavos.
            minor_unit: 2,
            value: Math.round(total * 100),
          },
          description,
          affiliate: {
            app_id: 'ch.forestacai.totem',
            key: sumupAffiliateKey,
            // É por aqui que /api/sumup-confirm-payment reencontra a transação.
            foreign_transaction_id: orderId,
          },
        }),
      },
    )

    if (readerRes.ok) return true

    // O cliente vê uma frase curta; o motivo de verdade vem para cá. Sem isto,
    // investigar uma recusa depende de reproduzi-la com alguém esperando no
    // balcão — foi assim que se descobriu a maquininha pareada em outra conta.
    const body = await readerRes.json().catch(() => null)
    console.error('SumUp recusou a cobrança na maquininha', {
      orderId,
      status: readerRes.status,
      reader: readerId,
      motivo: sumupError(body),
      body,
    })
    return false
  } catch (err) {
    console.error('Maquininha não respondeu', {
      orderId,
      reader: readerId,
      erro: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
