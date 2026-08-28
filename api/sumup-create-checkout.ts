import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
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
  // `errors` chega das duas formas: lista, e objeto com `detail` — foi o que
  // uma recusa real de maquininha devolveu ({"errors":{"detail":"Bad Request"}}).
  const deErrors = Array.isArray(data.errors)
    ? data.errors[0]?.message ?? data.errors[0]?.detail
    : data.errors?.message ?? data.errors?.detail

  const candidato = data.message ?? data.error_message ?? data.error?.message ?? deErrors
  return typeof candidato === 'string' && candidato.trim() ? candidato : null
}

/**
 * Manda a cobrança para a maquininha pareada. Devolve `false` — sem lançar —
 * quando a SumUp recusa ou o aparelho não responde, e registra nos logs o que
 * ela disse. O totem não tenta outra forma de pagamento: a cobrança é na
 * maquininha ou não é.
 */
async function startReaderCheckout(orderId: string, total: number, description: string): Promise<boolean> {
  try {
    const readerRes = await fetch(
      `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(sumupMerchantCode as string)}` +
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
          description,
          affiliate: {
            app_id: 'ch.forestacai.totem',
            key: sumupAffiliateKey,
            // É por aqui que /api/sumup-confirm-payment reencontra a transação.
            foreign_transaction_id: orderId,
          },
        }),
      },
    )

    if (readerRes.ok) return true

    // O cliente vê uma frase curta; o motivo de verdade vem para cá. Sem isto,
    // investigar uma recusa depende de reproduzi-la com alguém esperando no
    // balcão — foi assim que se descobriu a maquininha pareada em outra conta.
    const body = await readerRes.json().catch(() => null)
    console.error('SumUp recusou a cobrança na maquininha', {
      orderId,
      status: readerRes.status,
      reader: sumupReaderId,
      motivo: sumupError(body),
      body,
    })
    return false
  } catch (err) {
    console.error('Maquininha não respondeu', {
      orderId,
      reader: sumupReaderId,
      erro: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Confere a gorjeta que o totem mandou contra as opções cadastradas.
 *
 * O valor vem do cliente, então não pode ser aceito de olhos fechados: um
 * pedido forjado poderia mandar uma gorjeta negativa e reduzir o total. Aqui a
 * lista sai do banco e os valores são recalculados para este subtotal — só
 * passa o que bate com alguma opção ativa. O que não bate vira zero, e o
 * pedido segue: uma gorjeta que não confere não é motivo para perder a venda.
 *
 * As opções são as mesmas que o App da Mesa desenha, vindas da mesma tabela —
 * antes eram dois arrays iguais escritos à mão em arquivos diferentes.
 */
async function resolveTip(
  supabase: SupabaseClient,
  enviado: unknown,
  subtotal: number,
): Promise<number> {
  if (typeof enviado !== 'number' || !Number.isFinite(enviado) || enviado <= 0) return 0

  const { data, error } = await supabase.from('tip_options').select('tipo, valor').eq('ativo', true)
  if (error || !data) return 0

  const permitidos = data.map((o: { tipo: string; valor: number }) => {
    const bruto = o.tipo === 'fixo' ? Number(o.valor) : (subtotal * Number(o.valor)) / 100
    // Mesmo arredondamento de `tipAmountFor` em src/shared/types.ts, repetido
    // aqui porque as funções serverless da Vercel não compartilham o alias
    // @shared do bundle do front.
    return Math.round(bruto * 100) / 100
  })

  return permitidos.includes(Math.round(enviado * 100) / 100) ? enviado : 0
}

interface RawSelectedOption {
  option_id?: unknown
}

interface CartItemPayload {
  menu_item_id: string
  quantidade: number
  observacoes: string | null
  modifiers_selecionados: unknown
}

interface ResolvedItem {
  menu_item_id: string
  nome_item: string
  quantidade: number
  observacoes: string | null
  modifiers_selecionados: unknown[]
  preco_unitario: number
}

const MAX_QUANTIDADE_POR_ITEM = 30

/**
 * Reprecifica o carrinho a partir do banco. O totem manda `preco_unitario` só
 * para render otimista — nunca é o que se cobra: um pedido forjado poderia
 * declarar qualquer preço, então cada linha é refeita do zero a partir de
 * `menu_items.preco` mais o `preco_adicional` de cada opção de modifier
 * (também relido do banco, nunca do que o cliente mandou). Um item ou opção
 * que não existe mais, está indisponível, ou uma quantidade fora do razoável
 * derruba o pedido inteiro — não silenciosamente vira zero, como a gorjeta.
 */
async function resolveItems(
  supabase: SupabaseClient,
  raw: unknown,
): Promise<ResolvedItem[] | null> {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const cartItems = raw as CartItemPayload[]

  const menuItemIds = [...new Set(cartItems.map((it) => it.menu_item_id))]
  if (menuItemIds.some((id) => typeof id !== 'string' || !id)) return null

  const optionIds = [
    ...new Set(
      cartItems.flatMap((it) =>
        Array.isArray(it.modifiers_selecionados)
          ? (it.modifiers_selecionados as RawSelectedOption[])
              .map((o) => o.option_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
          : [],
      ),
    ),
  ]

  const [menuItemsRes, optionsRes] = await Promise.all([
    supabase.from('menu_items').select('id, nome, preco, disponivel').in('id', menuItemIds),
    optionIds.length > 0
      ? supabase.from('modifier_options').select('id, modifier_id, nome, nome_i18n, preco_adicional').in('id', optionIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (menuItemsRes.error || !menuItemsRes.data || optionsRes.error || !optionsRes.data) return null

  const modifierIds = [...new Set(optionsRes.data.map((o: { modifier_id: string }) => o.modifier_id))]
  const modifiersRes =
    modifierIds.length > 0
      ? await supabase.from('modifiers').select('id, nome').in('id', modifierIds)
      : { data: [], error: null }
  if (modifiersRes.error || !modifiersRes.data) return null

  const menuItemById = new Map(menuItemsRes.data.map((m: { id: string }) => [m.id, m]))
  const optionById = new Map(optionsRes.data.map((o: { id: string }) => [o.id, o]))
  const modifierNameById = new Map(
    modifiersRes.data.map((g: { id: string; nome: string }) => [g.id, g.nome]),
  )

  const resolved: ResolvedItem[] = []
  for (const it of cartItems) {
    const quantidade = Number(it.quantidade)
    if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > MAX_QUANTIDADE_POR_ITEM) return null

    const menuItem = menuItemById.get(it.menu_item_id) as
      | { id: string; nome: string; preco: number; disponivel: boolean }
      | undefined
    if (!menuItem || !menuItem.disponivel) return null

    const rawOptions = Array.isArray(it.modifiers_selecionados)
      ? (it.modifiers_selecionados as RawSelectedOption[])
      : []
    const resolvedOptions: unknown[] = []
    let addOnTotal = 0
    for (const raw of rawOptions) {
      if (typeof raw.option_id !== 'string') return null
      const option = optionById.get(raw.option_id) as
        | { id: string; modifier_id: string; nome: string; nome_i18n: Record<string, string>; preco_adicional: number }
        | undefined
      if (!option) return null
      addOnTotal += Number(option.preco_adicional)
      resolvedOptions.push({
        modifier_id: option.modifier_id,
        modifier_nome: modifierNameById.get(option.modifier_id) ?? '',
        option_id: option.id,
        option_nome: option.nome,
        option_nome_i18n: option.nome_i18n ?? {},
        preco_adicional: Number(option.preco_adicional),
      })
    }

    resolved.push({
      menu_item_id: menuItem.id,
      nome_item: menuItem.nome,
      quantidade,
      observacoes: typeof it.observacoes === 'string' ? it.observacoes.trim().slice(0, 500) || null : null,
      modifiers_selecionados: resolvedOptions,
      preco_unitario: Math.round((Number(menuItem.preco) + addOnTotal) * 100) / 100,
    })
  }
  return resolved
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey || !sumupMerchantCode) {
    res.status(500).json({ error: 'Servidor não configurado (variáveis de ambiente do SumUp ausentes).' })
    return
  }

  const { items, customerName, tip } = req.body ?? {}
  // Quem decide a forma de cobrança é o servidor, não o app: com uma maquininha
  // pareada o pedido vai para ela; sem maquininha, cai no checkout hospedado.
  const useReader = Boolean(sumupReaderId && sumupAffiliateKey)
  if (typeof customerName !== 'string' || !customerName.trim()) {
    res.status(400).json({ error: 'Nome do pedido é obrigatório.' })
    return
  }

  const cleanCustomerName = customerName.trim().slice(0, 80)

  // Chave de serviço: os pedidos nunca são escritos com a chave anon (ver
  // supabase/schema.sql — só a equipe logada e este servidor podem gravar em
  // `orders`/`order_items`), e é este reprecificamento que garante que o
  // valor cobrado é sempre o do cardápio, nunca o que o cliente declarou.
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
    const aceita = await startReaderCheckout(
      order.id,
      total,
      [cleanCustomerName, 'Forest Açaí'].join(' — '),
    )

    // Falhou, acabou. Não há segunda tentativa por outro caminho: o totem
    // cobra na maquininha e o cliente refaz o pedido se algo der errado.
    if (!aceita) {
      await supabase.from('orders').update({ status: 'cancelado' }).eq('id', order.id)
      res.status(502).json({ code: 'reader_unavailable', error: 'Não foi possível parear com o leitor.' })
      return
    }

    res.status(200).json({ orderId: order.id, mode: 'reader' })
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
      res.status(400).json({
        code: 'payment_start_failed',
        error: sumupError(checkoutData) ?? 'Não foi possível iniciar o pagamento.',
      })
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
    res.status(502).json({
      code: 'payment_start_failed',
      error: err instanceof Error ? err.message : 'Erro ao contatar o SumUp.',
    })
  }
}
