import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Cancela um pedido em dinheiro ou Twint ainda não confirmado pela equipe —
 * usado quando o cliente desiste na tela de espera do totem. Só mexe em
 * pedidos `aguardando_dinheiro`/`aguardando_twint`: uma vez que a equipe já
 * confirmou o recebimento (`recebido`), cancelar aqui não é mais seguro.
 * Vira `cancelado`, o que já basta para sumir do painel da equipe — os
 * hooks de pendências (useCashPendingOrders/useTwintPendingOrders) filtram
 * por status.
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

  const orderId = typeof req.body?.orderId === 'string' ? req.body.orderId : null
  if (!orderId) {
    res.status(400).json({ error: 'ID do pedido é obrigatório.' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelado' })
    .eq('id', orderId)
    .in('status', ['aguardando_dinheiro', 'aguardando_twint'])
    .select()
    .maybeSingle()

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }
  if (!data) {
    res.status(409).json({ error: 'Pedido já não está mais aguardando pagamento.' })
    return
  }

  res.status(200).json({ ok: true })
}
