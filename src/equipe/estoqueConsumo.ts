import type { SupabaseClient } from '@supabase/supabase-js'
import type { MenuItemInsumo, ModifierOption, OrderItem } from '@shared/types'

/** O suficiente de um pedido pra calcular consumo — aceita tanto `OrderWithItems`
 * (painel) quanto `ReportOrder` (pedidos em dinheiro aguardando confirmação). */
export interface ConsumoPedidoOrder {
  id: string
  items: OrderItem[]
}

type OptionSlim = Pick<ModifierOption, 'id' | 'nome' | 'insumo_id' | 'quantidade_padrao'>

export type ReferenceMaps = {
  composicaoPorItem: Map<string, MenuItemInsumo[]>
  menuItemNomeById: Map<string, string>
  optionById: Map<string, OptionSlim>
}

/** Busca a composição/vínculos atuais (a configuração de AGORA, não a de
 * quando o pedido foi feito) pros produtos e misturas usados num lote. */
export async function fetchReferenceMaps(
  supabase: SupabaseClient,
  selecionados: ConsumoPedidoOrder[],
): Promise<ReferenceMaps> {
  const menuItemIds = [
    ...new Set(selecionados.flatMap((o) => o.items.map((i) => i.menu_item_id).filter((id): id is string => !!id))),
  ]
  const optionIds = [
    ...new Set(selecionados.flatMap((o) => o.items.flatMap((i) => i.modifiers_selecionados.map((m) => m.option_id)))),
  ]

  const [composicaoRes, menuItemsRes, optionsRes] = await Promise.all([
    menuItemIds.length > 0
      ? supabase.from('menu_item_insumos').select('*').in('menu_item_id', menuItemIds)
      : Promise.resolve({ data: [] as MenuItemInsumo[], error: null }),
    menuItemIds.length > 0
      ? supabase.from('menu_items').select('id, nome').in('id', menuItemIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[], error: null }),
    optionIds.length > 0
      ? supabase.from('modifier_options').select('id, nome, insumo_id, quantidade_padrao').in('id', optionIds)
      : Promise.resolve({ data: [] as OptionSlim[], error: null }),
  ])
  if (composicaoRes.error) throw new Error(composicaoRes.error.message)
  if (menuItemsRes.error) throw new Error(menuItemsRes.error.message)
  if (optionsRes.error) throw new Error(optionsRes.error.message)

  const composicaoPorItem = new Map<string, MenuItemInsumo[]>()
  for (const row of composicaoRes.data ?? []) {
    const list = composicaoPorItem.get(row.menu_item_id) ?? []
    list.push(row)
    composicaoPorItem.set(row.menu_item_id, list)
  }

  return {
    composicaoPorItem,
    menuItemNomeById: new Map((menuItemsRes.data ?? []).map((m) => [m.id, m.nome])),
    optionById: new Map((optionsRes.data ?? []).map((o) => [o.id, o])),
  }
}

/** Consumo de um único pedido, dado os mapas de referência já buscados. */
export function consumoDoPedido(
  order: ConsumoPedidoOrder,
  maps: ReferenceMaps,
): { porInsumo: Map<string, number>; semComposicao: Set<string>; semVinculo: Set<string> } {
  const porInsumo = new Map<string, number>()
  const semComposicao = new Set<string>()
  const semVinculo = new Set<string>()

  for (const item of order.items) {
    if (item.menu_item_id) {
      const composicao = maps.composicaoPorItem.get(item.menu_item_id)
      if (!composicao || composicao.length === 0) {
        semComposicao.add(maps.menuItemNomeById.get(item.menu_item_id) ?? item.nome_item)
      } else {
        for (const linha of composicao) {
          porInsumo.set(linha.insumo_id, (porInsumo.get(linha.insumo_id) ?? 0) + linha.quantidade * item.quantidade)
        }
      }
    }
    for (const mod of item.modifiers_selecionados) {
      const opcao = maps.optionById.get(mod.option_id)
      if (!opcao || !opcao.insumo_id || !opcao.quantidade_padrao) {
        semVinculo.add(mod.option_nome)
        continue
      }
      porInsumo.set(opcao.insumo_id, (porInsumo.get(opcao.insumo_id) ?? 0) + opcao.quantidade_padrao * item.quantidade)
    }
  }

  return { porInsumo, semComposicao, semVinculo }
}

/** Linha única com a chave fixa do singleton — nunca existe uma segunda. */
const CONFIG_ID = '00000000-0000-0000-0000-000000000001'

/** Lê a flag global que liga/desliga a baixa automática assim que um pedido
 * é confirmado (ver switch no painel de Fechamento e `configuracoes_estoque`
 * no schema). */
export async function fechamentoAutomaticoAtivo(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('configuracoes_estoque')
    .select('fechamento_automatico')
    .eq('id', CONFIG_ID)
    .maybeSingle()
  return data?.fechamento_automatico ?? false
}

export async function definirFechamentoAutomatico(supabase: SupabaseClient, ativo: boolean) {
  const { error } = await supabase.from('configuracoes_estoque').update({ fechamento_automatico: ativo }).eq('id', CONFIG_ID)
  if (error) throw new Error(error.message)
}

/** Dá baixa no estoque de UM pedido: grava a movimentação de saída por
 * insumo que ele consumiu e marca o pedido como baixado. Usado tanto pelo
 * fechamento manual em lote (ver useFechamento) quanto pela baixa automática
 * ao confirmar um pedido em dinheiro (ver useCashPendingOrders) — pagamento
 * por cartão tem seu próprio duplicado em api/_estoqueConsumo.ts, porque
 * funções em api/ não importam de src/ de forma confiável no build da Vercel. */
export async function baixarEstoqueDoPedido(
  supabase: SupabaseClient,
  order: ConsumoPedidoOrder,
  criadoPor: string | null,
) {
  const maps = await fetchReferenceMaps(supabase, [order])
  const { porInsumo } = consumoDoPedido(order, maps)
  if (porInsumo.size > 0) {
    const { error: movErr } = await supabase.from('movimentacoes_estoque').insert(
      [...porInsumo.entries()].map(([insumo_id, quantidade]) => ({
        insumo_id,
        quantidade: -quantidade,
        tipo: 'saida_venda' as const,
        origem_tipo: 'order',
        origem_id: order.id,
        criado_por: criadoPor,
      })),
    )
    if (movErr) throw new Error(movErr.message)
  }
  const { error: updErr } = await supabase
    .from('orders')
    .update({ estoque_baixado: true, baixado_em: new Date().toISOString() })
    .eq('id', order.id)
  if (updErr) throw new Error(updErr.message)
}
