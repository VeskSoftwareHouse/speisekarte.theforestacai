import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const sumupApiKey = process.env.SUMUP_API_KEY

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

  if (!order.sumup_checkout_id) {
    res.status(400).json({ error: 'Pedido sem cobrança associada.' })
    return
  }

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

  if (sumupStatus === 'PAID') {
    await supabase.from('orders').update({ status: 'recebido' }).eq('id', orderId)
    res.status(200).json({ status: 'recebido' })
    return
  }

  if (sumupStatus === 'PENDING') {
    res.status(200).json({ status: 'aguardando_pagamento' })
    return
  }

  await supabase.from('orders').update({ status: 'cancelado' }).eq('id', orderId)
  res.status(200).json({ status: 'cancelado' })
}
