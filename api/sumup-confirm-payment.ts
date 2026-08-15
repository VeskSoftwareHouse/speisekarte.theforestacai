import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE

/**
 * Consulta a transação criada pelo Tap to Pay. O app da SumUp devolve o
 * resultado na URL de callback, mas isso é só uma dica: qualquer um poderia
 * digitar `?smp-status=success` na barra de endereço. A fonte da verdade é
 * esta consulta, feita pelo `foreign_transaction_id` (= id do pedido) que
 * mandamos junto com a cobrança.
 */
async function fetchTapTransactionStatus(orderId: string): Promise<string | null> {
  const url =
    `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(sumupMerchantCode as string)}` +
    `/transactions?foreign_transaction_id=${encodeURIComponent(orderId)}`
  const txRes = await fetch(url, { headers: { Authorization: `Bearer ${sumupApiKey}` } })
  if (!txRes.ok) return null
  const txData = await txRes.json()
  // A rota devolve o objeto direto quando encontra pela chave única, mas
  // aceita paginação em outros filtros — cobrimos os dois formatos.
  const tx = Array.isArray(txData) ? txData[0] : (txData?.items?.[0] ?? txData)
  return typeof tx?.status === 'string' ? tx.status : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !anonKey || !sumupApiKey) {
    res.status(500).json({ error: 'Servidor não configurado (variáveis de ambiente do SumUp ausentes).' })
    return
  }

  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : null
  if (!orderId) {
    res.status(400).json({ error: 'ID do pedido é obrigatório.' })
    return
  }

  const supabase = createClient(supabaseUrl, anonKey)

  const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (orderErr || !order) {
    res.status(404).json({ error: 'Pedido não encontrado.' })
    return
  }

  // Já processado antes (ex: o cliente atualizou a página) — não reconsulta a SumUp de novo.
  if (order.status !== 'aguardando_pagamento') {
    res.status(200).json({ status: order.status })
    return
  }

  let paid = false
  let stillPending = false

  if (order.sumup_checkout_id) {
    // Checkout hospedado: o pedido guarda o id da cobrança, então consultamos direto.
    let sumupStatus: string | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      const checkRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${order.sumup_checkout_id}`, {
        headers: { Authorization: `Bearer ${sumupApiKey}` },
      })
      const checkData = await checkRes.json()
      if (!checkRes.ok) {
        res.status(400).json({ error: checkData?.message ?? 'Não foi possível verificar o pagamento.' })
        return
      }
      sumupStatus = checkData.status
      if (sumupStatus !== 'PENDING') break
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
    paid = sumupStatus === 'PAID'
    stillPending = sumupStatus === 'PENDING'
  } else {
    // Tap to Pay: não há cobrança pré-criada, a transação nasce no app da SumUp.
    // Achamos ela pelo foreign_transaction_id que enviamos (= id do pedido).
    if (!sumupMerchantCode) {
      res.status(500).json({ error: 'Servidor não configurado (SUMUP_MERCHANT_CODE ausente).' })
      return
    }
    let txStatus: string | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      txStatus = await fetchTapTransactionStatus(orderId)
      if (txStatus && txStatus !== 'PENDING') break
      await new Promise((resolve) => setTimeout(resolve, 1200))
    }
    paid = txStatus === 'SUCCESSFUL'
    // `null` = transação ainda não apareceu na API (ou o cliente nem chegou a
    // aproximar o cartão). Nunca cancelamos por isso: um erro temporário na
    // consulta não pode derrubar um pedido que já foi pago.
    stillPending = txStatus === null || txStatus === 'PENDING'
  }

  if (paid) {
    await supabase.from('orders').update({ status: 'recebido' }).eq('id', orderId)
    res.status(200).json({ status: 'recebido' })
    return
  }

  if (stillPending) {
    res.status(200).json({ status: 'aguardando_pagamento' })
    return
  }

  await supabase.from('orders').update({ status: 'cancelado' }).eq('id', orderId)
  res.status(200).json({ status: 'cancelado' })
}
