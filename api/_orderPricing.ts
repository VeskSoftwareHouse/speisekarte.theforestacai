import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reprecificação de carrinho e conferência de gorjeta, compartilhadas entre
 * todas as rotas que criam um pedido (cartão via sumup-create-checkout.ts,
 * dinheiro via create-cash-order.ts). Nenhuma delas pode confiar no que o
 * totem manda — um pedido forjado poderia declarar qualquer preço ou
 * qualquer gorjeta — então tudo aqui é refeito a partir do banco.
 */

/**
 * Confere a gorjeta que o totem mandou contra as opções cadastradas.
 *
 * O valor vem do cliente, então não pode ser aceito de olhos fechados: um
 * pedido forjado poderia mandar uma gorjeta negativa e reduzir o total. Aqui a
 * lista sai do banco e os valores são recalculados para este subtotal — só
 * passa o que bate com alguma opção ativa. O que não bate vira zero, e o
 * pedido segue: uma gorjeta que não confere não é motivo para perder a venda.
 */
export async function resolveTip(
  supabase: SupabaseClient,
  enviado: unknown,
  subtotal: number,
): Promise<number> {
  if (typeof enviado !== 'number' || !Number.isFinite(enviado) || enviado <= 0) return 0

  const { data, error } = await supabase.from('tip_options').select('tipo, valor').eq('ativo', true)
  if (error || !data) return 0

  const permitidos = data.map((o: { tipo: string; valor: number }) => {
    const bruto = o.tipo === 'fixo' ? Number(o.valor) : (subtotal * Number(o.valor)) / 100
    return Math.round(bruto * 100) / 100
  })

  return permitidos.includes(Math.round(enviado * 100) / 100) ? enviado : 0
}

interface RawSelectedOption {
  option_id?: unknown
}

export interface CartItemPayload {
  menu_item_id: string
  quantidade: number
  observacoes: string | null
  modifiers_selecionados: unknown
}

export interface ResolvedItem {
  menu_item_id: string
  nome_item: string
  quantidade: number
  observacoes: string | null
  modifiers_selecionados: unknown[]
  preco_unitario: number
  /** Descrição do produto, só quando `menu_items.descricao_na_comanda` está ligado — vai carimbada pra comanda da cozinha. */
  descricao_item: string | null
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
export async function resolveItems(
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
    supabase
      .from('menu_items')
      .select('id, nome, descricao, preco, disponivel, descricao_na_comanda')
      .in('id', menuItemIds),
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
      | {
          id: string
          nome: string
          descricao: string | null
          preco: number
          disponivel: boolean
          descricao_na_comanda: boolean
        }
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
      descricao_item: menuItem.descricao_na_comanda && menuItem.descricao ? menuItem.descricao : null,
    })
  }
  return resolved
}
