import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireCaller } from './_auth.js'

const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE
const CURRENCY = 'CHF'

/** Mesmo parser de erro do sumup-create-checkout.ts — a SumUp não usa um formato só. */
function sumupError(data: any): string | null {
  if (!data) return null
  const deErrors = Array.isArray(data.errors)
    ? data.errors[0]?.message ?? data.errors[0]?.detail
    : data.errors?.message ?? data.errors?.detail
  const candidato = data.message ?? data.error_message ?? data.error?.message ?? deErrors
  return typeof candidato === 'string' && candidato.trim() ? candidato : null
}

/**
 * Diagnóstico pontual: cria um checkout de teste (CHF 1.00, nunca pago) só
 * pra perguntar à SumUp `GET /checkouts/{id}/payment-methods` — a única forma
 * documentada de saber quais métodos (Twint incluído) estão liberados de
 * verdade pra ESTA conta, já que a doc geral é só um catálogo, não uma
 * garantia por comerciante. Não grava nada em `orders`: é uma pergunta à
 * SumUp, não um pedido. Apaga o checkout de teste ao final.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!sumupApiKey || !sumupMerchantCode) {
    res.status(500).json({ error: 'Servidor não configurado (variáveis de ambiente do SumUp ausentes).' })
    return
  }
  if (!(await requireCaller(req))) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const origin = `https://${req.headers.host}`
  let checkoutId: string | null = null

  try {
    const createRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sumupApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkout_reference: `diagnostico-metodos-${Date.now()}`,
        amount: 1,
        currency: CURRENCY,
        merchant_code: sumupMerchantCode,
        description: 'Diagnóstico de métodos disponíveis — não pagar',
        redirect_url: `${origin}/equipe/`,
        hosted_checkout: { enabled: true },
      }),
    })
    const createData = await createRes.json().catch(() => null)
    if (!createRes.ok || !createData?.id) {
      res.status(400).json({ error: sumupError(createData) ?? 'Não foi possível criar o checkout de teste.', raw: createData })
      return
    }
    checkoutId = createData.id as string

    const methodsRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}/payment-methods`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    })
    const methodsData = await methodsRes.json().catch(() => null)
    if (!methodsRes.ok) {
      res.status(400).json({ error: sumupError(methodsData) ?? 'Não foi possível consultar os métodos.', raw: methodsData })
      return
    }

    const items: { id: string; name: string }[] = methodsData?.items ?? []
    res.status(200).json({
      methods: items,
      twintDisponivel: items.some((m) => m.id === 'twint'),
    })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao contatar a SumUp.' })
  } finally {
    if (checkoutId) {
      await fetch(`https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(checkoutId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sumupApiKey}` },
      }).catch(() => {})
    }
  }
}
