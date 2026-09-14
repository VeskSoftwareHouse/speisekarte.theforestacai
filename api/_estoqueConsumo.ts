import type { SupabaseClient } from '@supabase/supabase-js'

interface SelectedModifierOptionRow {
  option_id: string
  quantidade: number
}

interface OrderItemRow {
  menu_item_id: string | null
  quantidade: number
  modifiers_selecionados: SelectedModifierOptionRow[] | null
}

const CONFIG_ID = '00000000-0000-0000-0000-000000000001'

/** Lê a flag global (ver switch em Estoque → Fechamento no painel) que
 * liga/desliga a baixa automática de estoque assim que um pedido é
 * confirmado. */
export async function fechamentoAutomaticoAtivo(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('configuracoes_estoque')
    .select('fechamento_automatico')
    .eq('id', CONFIG_ID)
    .maybeSingle()
  return data?.fechamento_automatico ?? false
}

/**
 * Dá baixa no estoque de um pedido de cartão assim que o pagamento é
 * confirmado — mesma lógica do fechamento manual (ver useFechamento.ts /
 * estoqueConsumo.ts no painel), duplicada aqui porque funções em api/ não
 * importam de src/ de forma confiável no build da Vercel (alias @shared não
 * resolve no bundler zero-config). Nunca lança: uma falha aqui não pode
 * derrubar uma confirmação de pagamento que já aconteceu de verdade — a
 * equipe sempre pode fechar esse pedido manualmente depois.
 */
export async function baixarEstoqueDoPedido(supabase: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, estoque_baixado')
      .eq('id', orderId)
      .maybeSingle()
    if (!order || order.estoque_baixado) return

    const { data: itemsData } = await supabase
      .from('order_items')
      .select('menu_item_id, quantidade, modifiers_selecionados')
      .eq('order_id', orderId)
    const items = (itemsData ?? []) as OrderItemRow[]

    const menuItemIds = [...new Set(items.map((i) => i.menu_item_id).filter((id): id is string => !!id))]
    const optionIds = [...new Set(items.flatMap((i) => (i.modifiers_selecionados ?? []).map((m) => m.option_id)))]

    const [composicaoRes, optionsRes] = await Promise.all([
      menuItemIds.length > 0
        ? supabase.from('menu_item_insumos').select('menu_item_id, insumo_id, quantidade').in('menu_item_id', menuItemIds)
        : Promise.resolve({ data: [] as { menu_item_id: string; insumo_id: string; quantidade: number }[] }),
      optionIds.length > 0
        ? supabase.from('modifier_options').select('id, insumo_id, quantidade_padrao').in('id', optionIds)
        : Promise.resolve({ data: [] as { id: string; insumo_id: string | null; quantidade_padrao: number | null }[] }),
    ])

    const composicaoPorItem = new Map<string, { insumo_id: string; quantidade: number }[]>()
    for (const row of composicaoRes.data ?? []) {
      const list = composicaoPorItem.get(row.menu_item_id) ?? []
      list.push(row)
      composicaoPorItem.set(row.menu_item_id, list)
    }
    const optionById = new Map((optionsRes.data ?? []).map((o) => [o.id, o]))

    const porInsumo = new Map<string, number>()
    for (const item of items) {
      if (item.menu_item_id) {
        for (const linha of composicaoPorItem.get(item.menu_item_id) ?? []) {
          porInsumo.set(linha.insumo_id, (porInsumo.get(linha.insumo_id) ?? 0) + linha.quantidade * item.quantidade)
        }
      }
      for (const mod of item.modifiers_selecionados ?? []) {
        const opcao = optionById.get(mod.option_id)
        if (!opcao?.insumo_id || !opcao.quantidade_padrao) continue
        porInsumo.set(
          opcao.insumo_id,
          (porInsumo.get(opcao.insumo_id) ?? 0) + opcao.quantidade_padrao * (mod.quantidade ?? 1) * item.quantidade,
        )
      }
    }

    if (porInsumo.size > 0) {
      await supabase.from('movimentacoes_estoque').insert(
        [...porInsumo.entries()].map(([insumo_id, quantidade]) => ({
          insumo_id,
          quantidade: -quantidade,
          tipo: 'saida_venda' as const,
          origem_tipo: 'order',
          origem_id: orderId,
          criado_por: null,
        })),
      )
    }
    await supabase.from('orders').update({ estoque_baixado: true, baixado_em: new Date().toISOString() }).eq('id', orderId)
  } catch {
    // silencioso, ver comentário acima
  }
}
