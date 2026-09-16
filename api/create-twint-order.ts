import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { resolveItems, resolveTip } from './_orderPricing.js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Cria um pedido para pagar por Twint, mostrando o número da conta ao
 * cliente no totem. Não fala com nenhuma API do Twint — só grava o pedido
 * como `aguardando_twint`, no mesmo formato (e com a mesma reprecificação a
 * partir do banco) que create-cash-order.ts usa pro dinheiro. Quem tira o
 * pedido dessa espera é a equipe, conferindo o recebimento no painel (update
 * direto na tabela, permitido pela RLS pra quem está logado — ver
 * supabase/schema.sql).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado (SUPABASE_SERVICE_ROLE_KEY ausente).' })
    return
  }

  const { items, customerName, tip } = req.body ?? {}
  if (typeof customerName !== 'string' || !customerName.trim()) {
    res.status(400).json({ error: 'Nome do pedido é obrigatório.' })
    return
  }
  const cleanCustomerName = customerName.trim().slice(0, 80)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const cartItems = await resolveItems(supabase, items)
  if (!cartItems) {
    res.status(400).json({ error: 'Pedido inválido.' })
    return
  }
  const subtotal = cartItems.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0)
  if (!(subtotal > 0)) {
    res.status(400).json({ error: 'Valor do pedido inválido.' })
    return
  }
  const tipAmount = await resolveTip(supabase, tip, subtotal)
  const total = Number((subtotal + tipAmount).toFixed(2))

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      status: 'aguardando_twint',
      valor_pago: total,
      gorjeta: tipAmount,
      nome_cliente: cleanCustomerName,
    })
    .select()
    .single()
  if (orderErr || !order) {
    console.error('create-twint-order: falha ao inserir em orders', orderErr)
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
    descricao_item: it.descricao_item,
  }))
  const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsPayload)
  if (itemsErr) {
    console.error('create-twint-order: falha ao inserir em order_items', { orderId: order.id, itemsErr })
    await supabase.from('orders').delete().eq('id', order.id)
    res.status(400).json({ error: itemsErr.message })
    return
  }

  res.status(200).json({ orderId: order.id })
}
