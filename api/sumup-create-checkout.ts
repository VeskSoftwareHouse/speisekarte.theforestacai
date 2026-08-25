import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY
const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE
// Id da maquininha Solo pareada (ver scripts/sumup-pair-reader.md). Definido =
// o totem cobra na maquininha; ausente = cai no checkout hospedado.
const sumupReaderId = process.env.SUMUP_READER_ID
const sumupAffiliateKey = process.env.SUMUP_AFFILIATE_KEY

// Moeda da cobrança. Tem de bater com a moeda da conta SumUp da loja: os
// preços do cardápio sempre foram francos, e durante os testes eles saíam
// cobrados em reais — o mesmo número, na moeda errada.
const CURRENCY = 'CHF'

/**
 * Extrai o que a SumUp disse de errado. Ela não usa um formato só: às vezes é
 * `message`, às vezes `error_message`, às vezes uma lista em `errors`. Ler só
 * um deles fazia toda falha cair no texto genérico do totem, e a causa real
 * — a maquininha registrada em outra conta, por exemplo — nunca chegava a
 * ninguém.
 */
function sumupError(data: any): string | null {
  if (!data) return null
  const candidato =
    data.message ??
    data.error_message ??
    data.error?.message ??
    (Array.isArray(data.errors) ? data.errors[0]?.message : null)
  return typeof candidato === 'string' && candidato.trim() ? candidato : null
}

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

  const { items, customerName, tip } = req.body ?? {}
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Pedido inválido.' })
    return
  }
  // Quem decide a forma de cobrança é o servidor, não o app: com uma maquininha
  // pareada o pedido vai para ela; sem maquininha, cai no checkout hospedado.
  const useReader = Boolean(sumupReaderId && sumupAffiliateKey)
  if (typeof customerName !== 'string' || !customerName.trim()) {
    res.status(400).json({ error: 'Nome do pedido é obrigatório.' })
    return
  }

  const ALLOWED_TIPS = [0, 5, 10, 20]
  const tipAmount = ALLOWED_TIPS.includes(tip) ? tip : 0
  const cleanCustomerName = customerName.trim().slice(0, 80)

  const cartItems = items as CartItemPayload[]
  const subtotal = cartItems.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0)
  if (!(subtotal > 0)) {
    res.status(400).json({ error: 'Valor do pedido inválido.' })
    return
  }
  const total = Number((subtotal + tipAmount).toFixed(2))

  const supabase = createClient(supabaseUrl, anonKey)

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      status: 'aguardando_pagamento',
      valor_pago: total,
      gorjeta: tipAmount,
      nome_cliente: cleanCustomerName,
    })
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

  // Maquininha Solo: manda a cobrança para o aparelho, que acende sozinho
  // pedindo a aproximação do cartão. O cliente não escolhe forma de pagamento
  // e não sai do cardápio — o app só fica aguardando e perguntando ao servidor
  // se já pagou (/api/sumup-confirm-payment).
  if (useReader) {
    try {
      const readerRes = await fetch(
        `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(sumupMerchantCode)}` +
          `/readers/${encodeURIComponent(sumupReaderId as string)}/checkout`,
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
            description: [cleanCustomerName, 'Forest Açaí'].join(' — '),
            affiliate: {
              app_id: 'ch.forestacai.totem',
              key: sumupAffiliateKey,
              // É por aqui que /api/sumup-confirm-payment reencontra a transação.
              foreign_transaction_id: order.id,
            },
          }),
        },
      )
      const readerData = await readerRes.json().catch(() => null)
      if (!readerRes.ok) {
        // Vai para os logs da Vercel com o pedido junto: sem isto, investigar
        // uma recusa depende de reproduzir a falha com o cliente esperando.
        console.error('SumUp recusou a cobrança na maquininha', {
          orderId: order.id,
          status: readerRes.status,
          reader: sumupReaderId,
          body: readerData,
        })
        await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
        res.status(400).json({
          error: sumupError(readerData) ?? 'Não foi possível iniciar o pagamento na maquininha.',
        })
        return
      }
      res.status(200).json({ orderId: order.id, mode: 'reader' })
      return
    } catch (err) {
      await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
      res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao contatar o SumUp.' })
      return
    }
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
        amount: total,
        currency: CURRENCY,
        merchant_code: sumupMerchantCode,
        description: [cleanCustomerName, 'Forest Açaí'].filter(Boolean).join(' — '),
        redirect_url: redirectUrl,
        hosted_checkout: { enabled: true },
      }),
    })

    const checkoutData = await checkoutRes.json().catch(() => null)
    if (!checkoutRes.ok || !checkoutData?.hosted_checkout_url) {
      console.error('SumUp recusou o checkout hospedado', {
        orderId: order.id,
        status: checkoutRes.status,
        body: checkoutData,
      })
      await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
      res.status(400).json({ error: sumupError(checkoutData) ?? 'Não foi possível iniciar o pagamento.' })
      return
    }

    await supabase.from('orders').update({ sumup_checkout_id: checkoutData.id }).eq('id', order.id)

    res.status(200).json({
      orderId: order.id,
      mode: 'hosted',
      hostedCheckoutUrl: checkoutData.hosted_checkout_url,
    })
  } catch (err) {
    await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao contatar o SumUp.' })
  }
}
