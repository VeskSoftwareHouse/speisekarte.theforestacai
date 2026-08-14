import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE

interface CartItemPayload {
  menu_item_id: string
  nome_item: string
  quantidade: number
  observacoes: string | null
  modifiers_selecionados: unknown
  preco_unitario: number
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !anonKey || !sumupApiKey || !sumupMerchantCode) {
    res.status(500).json({ error: 'Servidor não configurado (variáveis de ambiente do SumUp ausentes).' })
    return
  }

  const { tableId, tableNumero, items } = req.body ?? {}
  if (!tableId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Pedido inválido.' })
    return
  }

  const cartItems = items as CartItemPayload[]
  const total = cartItems.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0)
  if (!(total > 0)) {
    res.status(400).json({ error: 'Valor do pedido inválido.' })
    return
  }

  const supabase = createClient(supabaseUrl, anonKey)

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({ table_id: tableId, status: 'aguardando_pagamento', valor_pago: Number(total.toFixed(2)) })
    .select()
    .single()
  if (orderErr || !order) {
    res.status(400).json({ error: orderErr?.message ?? 'Não foi possível criar o pedido.' })
    return
  }

  const orderItemsPayload = cartItems.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id,
    nome_item: it.nome_item,
    quantidade: it.quantidade,
    observacoes: it.observacoes,
    modifiers_selecionados: it.modifiers_selecionados,
    preco_unitario: it.preco_unitario,
  }))
  const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload)
  if (itemsErr) {
    await supabase.from('orders').delete().eq('id', order.id)
    res.status(400).json({ error: itemsErr.message })
    return
  }

  const origin = `https://${req.headers.host}`
  const redirectUrl = `${origin}/mesa/?pedido=${order.id}`

  try {
    const checkoutRes = await fetch('https://api.sumup.com/v0.1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sumupApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        checkout_reference: order.id,
        amount: Number(total.toFixed(2)),
        // TODO: provisório para teste — trocar para a moeda real da conta SumUp
        // (ou tornar configurável via env var) antes de ir para produção.
        currency: 'BRL',
        merchant_code: sumupMerchantCode,
        description: tableNumero ? `Forest Açaí — Mesa ${tableNumero}` : 'Forest Açaí',
        redirect_url: redirectUrl,
        hosted_checkout: { enabled: true },
      }),
    })

    const checkoutData = await checkoutRes.json()
    if (!checkoutRes.ok || !checkoutData?.hosted_checkout_url) {
      await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
      res.status(400).json({ error: checkoutData?.message ?? 'Não foi possível iniciar o pagamento.' })
      return
    }

    await supabase.from('orders').update({ sumup_checkout_id: checkoutData.id }).eq('id', order.id)

    res.status(200).json({ orderId: order.id, hostedCheckoutUrl: checkoutData.hosted_checkout_url })
  } catch (err) {
    await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao contatar o SumUp.' })
  }
}
