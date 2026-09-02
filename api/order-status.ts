import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Status de um pedido, por id — usado pelo totem pra saber quando um pedido
 * em dinheiro (aguardando_dinheiro) foi confirmado pela equipe no caixa.
 * Só leitura, sem lógica: quem muda o status é a equipe, direto na tabela
 * (ver ConfirmCashPanel no App da Equipe). Como orders/order_items não são
 * mais legíveis com a chave anon (ver supabase/schema.sql), o totem precisa
 * desta rota — com a chave de serviço — pra sequer saber se o pedido já
 * saiu do "aguardando".
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

  const { data, error } = await supabase.from('orders').select('status').eq('id', orderId).maybeSingle()
  if (error || !data) {
    res.status(404).json({ error: 'Pedido não encontrado.' })
    return
  }

  res.status(200).json({ status: data.status })
}
