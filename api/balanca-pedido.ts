import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { startReaderCheckout } from './_sumupReader.js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE
// Maquininha própria da estação da balança — nunca a do totem do cardápio,
// senão as duas cobranças disputariam o mesmo aparelho.
const readerId = process.env.SUMUP_READER_ID_BALANCA
const balancaToken = process.env.BALANCA_TOKEN

const precoPor100g = Number(process.env.BALANCA_PRECO_100G)
// Peso do copo vazio, descontado do que a balança marca.
const taraG = Number(process.env.BALANCA_TARA_G ?? 0) || 0
// Teto de sanidade: um peso maior que isto é balança com defeito (ou alguém
// mandando um número inventado), não um copo de açaí.
const pesoMaxG = Number(process.env.BALANCA_PESO_MAX_G ?? 1500) || 1500
const PESO_MIN_G = 10

function tokenValido(req: VercelRequest): boolean {
  const enviado = req.headers['x-balanca-token']
  if (!balancaToken || typeof enviado !== 'string') return false
  const a = Buffer.from(enviado)
  const b = Buffer.from(balancaToken)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Pedido de autoatendimento por peso.
 *
 * GET  -> preço por 100 g, tara e teto de peso (a tela mostra o total antes de
 *         cobrar, mas quem decide o valor é sempre o POST, daqui).
 * POST -> `{ pesoGramas }` com o peso LÍQUIDO (copo já descontado): grava o
 *         pedido `aguardando_pagamento` com origem 'balanca' e manda a cobrança
 *         para a maquininha da balança. Depois disso o fluxo é o do totem:
 *         /api/sumup-confirm-payment confirma o pagamento.
 *
 * O servidor não consegue conferir o peso, então só aceita quem conhece o
 * código do totem (BALANCA_TOKEN) e dentro de limites razoáveis. O preço nunca
 * vem do cliente. É uma função só (GET + POST) para não gastar o limite de
 * funções do plano da Vercel.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey || !sumupMerchantCode || !readerId || !balancaToken) {
    res.status(500).json({ error: 'Balança não configurada (variáveis de ambiente ausentes).' })
    return
  }
  if (!(precoPor100g > 0)) {
    res.status(500).json({ error: 'Balança não configurada (BALANCA_PRECO_100G inválido).' })
    return
  }
  if (!tokenValido(req)) {
    res.status(401).json({ error: 'Código do totem inválido.' })
    return
  }

  if (req.method === 'GET') {
    res.status(200).json({ precoPor100g, taraG, pesoMaxG })
    return
  }

  const peso = Number(req.body?.pesoGramas)
  if (!Number.isFinite(peso) || peso < PESO_MIN_G || peso > pesoMaxG) {
    res.status(400).json({ error: 'Peso inválido.' })
    return
  }
  const pesoGramas = Math.round(peso)
  const total = Number(((pesoGramas / 100) * precoPor100g).toFixed(2))
  if (!(total > 0)) {
    res.status(400).json({ error: 'Valor do pedido inválido.' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      status: 'aguardando_pagamento',
      valor_pago: total,
      gorjeta: 0,
      nome_cliente: 'Self-service',
      origem: 'balanca',
    })
    .select()
    .single()
  if (orderErr || !order) {
    console.error('balanca-pedido: falha ao inserir em orders', orderErr)
    res.status(400).json({ error: orderErr?.message ?? 'Não foi possível criar o pedido.' })
    return
  }

  const { error: itemErr } = await supabase.from('order_items').insert({
    order_id: order.id,
    menu_item_id: null,
    nome_item: 'Açaí self-service',
    quantidade: 1,
    observacoes: `${pesoGramas} g × CHF ${precoPor100g.toFixed(2)}/100 g`,
    modifiers_selecionados: [],
    preco_unitario: total,
  })
  if (itemErr) {
    console.error('balanca-pedido: falha ao inserir em order_items', { orderId: order.id, itemErr })
    await supabase.from('orders').delete().eq('id', order.id)
    res.status(400).json({ error: itemErr.message })
    return
  }

  const aceita = await startReaderCheckout(readerId, order.id, total, `Self-service ${pesoGramas} g — Forest Açaí`)
  if (!aceita) {
    await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
    res.status(502).json({ code: 'reader_unavailable', error: 'Não foi possível parear com o leitor.' })
    return
  }

  res.status(200).json({ orderId: order.id, total, pesoGramas })
}
