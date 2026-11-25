import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { baixarEstoqueDoPedido, fechamentoAutomaticoAtivo } from './_estoqueConsumo.js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sumupApiKey = process.env.SUMUP_API_KEY
const sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE

/**
 * Consulta a transação criada pelo Tap to Pay. O app da SumUp devolve o
 * resultado na URL de callback, mas isso é só uma dica: qualquer um poderia
 * digitar `?smp-status=success` na barra de endereço. A fonte da verdade é
 * esta consulta, feita pelo `foreign_transaction_id` (= id do pedido) que
 * mandamos junto com a cobrança.
 */
async function fetchTapTransaction(orderId: string): Promise<Record<string, any> | null> {
  const url =
    `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(sumupMerchantCode as string)}` +
    `/transactions?foreign_transaction_id=${encodeURIComponent(orderId)}`
  const txRes = await fetch(url, { headers: { Authorization: `Bearer ${sumupApiKey}` } })
  if (!txRes.ok) return null
  const txData = await txRes.json()
  // A rota devolve o objeto direto quando encontra pela chave única, mas
  // aceita paginação em outros filtros — cobrimos os dois formatos.
  const tx = Array.isArray(txData) ? txData[0] : (txData?.items?.[0] ?? txData)
  return typeof tx?.status === 'string' ? tx : null
}

// Rótulos em alemão: a loja é suíça, e este texto sai no comprovante do
// cliente e na planilha que vai para a contabilidade de lá. O painel da
// equipe é em português, mas ele não é quem lê este campo.
const ENTRY_MODE_LABEL: Record<string, string> = {
  CONTACTLESS: 'Kontaktlos',
  CHIP: 'Chip',
  MAGSTRIPE: 'Magnetstreifen',
  MANUAL_ENTRY: 'Manuell erfasst',
  BOARDING: 'Kontaktlos',
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  ECOM: 'Online',
  POS: 'Kartenterminal',
  RECURRING: 'Wiederkehrend',
  BOLETO: 'Boleto',
  PIX: 'Pix',
  IDEAL: 'iDEAL',
  BANCONTACT: 'Bancontact',
  BLIK: 'BLIK',
  SOFORT: 'Sofort',
  GOOGLE_PAY: 'Google Pay',
  APPLE_PAY: 'Apple Pay',
}

/**
 * Traduz o que a SumUp conta sobre a transação para o rótulo gravado em
 * `orders.forma_pagamento` — o mesmo que sai no comprovante do cliente e na
 * exportação para a contabilidade.
 *
 * A SumUp descreve o pagamento em três campos diferentes conforme o caminho
 * (maquininha, checkout hospedado, carteira digital), e às vezes dentro de
 * `transactions[0]`. Tentamos do mais específico para o mais genérico e
 * devolvemos null quando nada é reconhecido — melhor um pedido sem rótulo
 * do que um rótulo errado no relatório.
 */
function describePaymentMethod(source: Record<string, any> | null | undefined): string | null {
  if (!source) return null
  const tx = source.transactions?.[0] ?? source

  const entryMode = typeof tx.entry_mode === 'string' ? ENTRY_MODE_LABEL[tx.entry_mode] : null
  const paymentType = typeof tx.payment_type === 'string' ? PAYMENT_TYPE_LABEL[tx.payment_type] : null
  const base = entryMode ?? paymentType
  if (!base) return null

  // Bandeira do cartão, quando houver: "Kontaktlos · VISA".
  const brand = typeof tx.card?.type === 'string' ? tx.card.type : null
  return brand ? `${base} · ${brand}` : base
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    res.status(500).json({ error: 'Servidor não configurado (variáveis de ambiente do SumUp ausentes).' })
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
  let paymentMethod: string | null = null

  if (order.sumup_checkout_id) {
    // Checkout hospedado: o pedido guarda o id da cobrança, então consultamos direto.
    let sumupStatus: string | null = null
    let lastCheckData: Record<string, any> | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      const checkRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${order.sumup_checkout_id}`, {
        headers: { Authorization: `Bearer ${sumupApiKey}` },
      })
      const checkData = await checkRes.json()
      if (!checkRes.ok) {
        res.status(400).json({ error: checkData?.message ?? 'Não foi possível verificar o pagamento.' })
        return
      }
      lastCheckData = checkData
      sumupStatus = checkData.status
      if (sumupStatus !== 'PENDING') break
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    paid = sumupStatus === 'PAID'
    stillPending = sumupStatus === 'PENDING'
    if (paid) paymentMethod = describePaymentMethod(lastCheckData)
  } else {
    // Tap to Pay: não há cobrança pré-criada, a transação nasce no app da SumUp.
    // Achamos ela pelo foreign_transaction_id que enviamos (= id do pedido).
    if (!sumupMerchantCode) {
      res.status(500).json({ error: 'Servidor não configurado (SUMUP_MERCHANT_CODE ausente).' })
      return
    }
    let tx: Record<string, any> | null = null
    let txStatus: string | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      tx = await fetchTapTransaction(orderId)
      txStatus = typeof tx?.status === 'string' ? tx.status : null
      if (txStatus && txStatus !== 'PENDING') break
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    paid = txStatus === 'SUCCESSFUL'
    if (paid) paymentMethod = describePaymentMethod(tx)
    // `null` = transação ainda não apareceu na API (ou o cliente nem chegou a
    // aproximar o cartão). Nunca cancelamos por isso: um erro temporário na
    // consulta não pode derrubar um pedido que já foi pago.
    stillPending = txStatus === null || txStatus === 'PENDING'
  }

  if (paid) {
    // `pago_em` é carimbado pelo gatilho do banco na troca de status.
    // Condicional ao status: duas consultas simultâneas (totem + varredura do
    // painel) não baixam o estoque duas vezes.
    // Pedido da balança é autoatendimento: não passa pela cozinha, então já
    // nasce `entregue` (o gatilho só carimba `pago_em` ao entrar em `recebido`,
    // por isso ele é gravado aqui).
    const selfService = order.origem === 'balanca'
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update(
        selfService
          ? { status: 'entregue', forma_pagamento: paymentMethod, pago_em: new Date().toISOString() }
          : { status: 'recebido', forma_pagamento: paymentMethod },
      )
      .eq('id', orderId)
      .eq('status', 'aguardando_pagamento')
      .select('id')
    if (updateErr) {
      // Antes o erro era ignorado e o totem recebia "recebido" com o pedido
      // ainda preso no banco: cliente satisfeito, cozinha sem comanda.
      console.error('sumup-confirm-payment: falha ao marcar como recebido', { orderId, updateErr })
      res.status(500).json({ error: 'Pagamento confirmado, mas não foi possível registrar o pedido.' })
      return
    }
    if (updated && updated.length > 0) {
      try {
        if (await fechamentoAutomaticoAtivo(supabase)) await baixarEstoqueDoPedido(supabase, orderId)
      } catch (err) {
        // Baixa de estoque é conveniência: o pedido já está pago e na cozinha.
        console.error('sumup-confirm-payment: falha na baixa de estoque', { orderId, err })
      }
    }
    res.status(200).json({ status: selfService ? 'entregue' : 'recebido' })
    return
  }

  if (stillPending) {
    res.status(200).json({ status: 'aguardando_pagamento' })
    return
  }

  await supabase.from('orders').update({ status: 'cancelado' }).eq('id', orderId)
  res.status(200).json({ status: 'cancelado' })
}
