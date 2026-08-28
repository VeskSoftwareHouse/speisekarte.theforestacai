import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Devolve o recibo de um pedido, dado o seu id.
 *
 * `orders`/`order_items` não são mais legíveis com a chave anon (ver
 * supabase/schema.sql) — isso fechou a leitura pública em massa, onde
 * qualquer um podia listar todos os pedidos da loja de uma vez. Esta rota
 * reabre, com a chave de serviço, só a consulta pontual por id que a página
 * de recibo (aberta pelo QR code impresso) precisa. Como o id é um uuid não
 * adivinhável, só chega aqui quem tem o link.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado (SUPABASE_SERVICE_ROLE_KEY ausente).' })
    return
  }

  const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null
  if (!orderId) {
    res.status(400).json({ error: 'ID do pedido é obrigatório.' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, status, criado_em, pago_em, valor_pago, gorjeta, nome_cliente, forma_pagamento, ' +
        'order_items(id, nome_item, quantidade, preco_unitario, modifiers_selecionados, observacoes)',
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error || !data) {
    res.status(404).json({ error: 'Pedido não encontrado.' })
    return
  }

  res.status(200).json({ order: data })
}
