import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { MenuItemInsumo, ModifierOption, OrderItem, OrderWithItems } from '@shared/types'

interface OrderRow extends Omit<OrderWithItems, 'items'> {
  order_items?: OrderItem[]
}

export interface ConsumoPreview {
  porInsumo: { insumo_id: string; quantidade: number }[]
  /** Nomes de produtos usados no lote que não têm composição cadastrada — não bloqueiam o fechamento, só avisam. */
  itensSemComposicao: string[]
  /** Nomes de misturas usadas no lote que não têm insumo vinculado — idem. */
  opcoesSemVinculo: string[]
}

type OptionSlim = Pick<ModifierOption, 'id' | 'nome' | 'insumo_id' | 'quantidade_padrao'>

type ReferenceMaps = {
  composicaoPorItem: Map<string, MenuItemInsumo[]>
  menuItemNomeById: Map<string, string>
  optionById: Map<string, OptionSlim>
}

/**
 * Pedidos pagos/confirmados (cartão ou dinheiro) que ainda não foram
 * fechados. Reaproveita os pedidos que já vêm do totem — não existe uma
 * tela de venda separada — e transforma cada um em baixa de estoque, a
 * partir da composição atual dos produtos e do vínculo atual das misturas
 * (a configuração de AGORA, não a de quando o pedido foi feito).
 */
export function useFechamento(currentUserId: string) {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () =>
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .not('status', 'in', '(aguardando_pagamento,aguardando_dinheiro,cancelado)')
          .eq('estoque_baixado', false)
          .order('criado_em', { ascending: false }),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setOrders(
      ((data ?? []) as OrderRow[]).map(({ order_items, ...order }) => ({
        ...order,
        items: order_items ?? [],
      })),
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function fetchReferenceMaps(selecionados: OrderWithItems[]): Promise<ReferenceMaps> {
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
  function consumoDoPedido(
    order: OrderWithItems,
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
        porInsumo.set(
          opcao.insumo_id,
          (porInsumo.get(opcao.insumo_id) ?? 0) + opcao.quantidade_padrao * item.quantidade,
        )
      }
    }

    return { porInsumo, semComposicao, semVinculo }
  }

  /** Prévia do lote inteiro, para mostrar antes de confirmar o fechamento. */
  async function calcularConsumo(selecionados: OrderWithItems[]): Promise<ConsumoPreview> {
    const maps = await fetchReferenceMaps(selecionados)
    const total = new Map<string, number>()
    const itensSemComposicao = new Set<string>()
    const opcoesSemVinculo = new Set<string>()

    for (const order of selecionados) {
      const { porInsumo, semComposicao, semVinculo } = consumoDoPedido(order, maps)
      for (const [insumoId, qtd] of porInsumo) total.set(insumoId, (total.get(insumoId) ?? 0) + qtd)
      for (const nome of semComposicao) itensSemComposicao.add(nome)
      for (const nome of semVinculo) opcoesSemVinculo.add(nome)
    }

    return {
      porInsumo: [...total.entries()].map(([insumo_id, quantidade]) => ({ insumo_id, quantidade })),
      itensSemComposicao: [...itensSemComposicao],
      opcoesSemVinculo: [...opcoesSemVinculo],
    }
  }

  /**
   * Fecha o lote: para cada pedido, grava uma movimentação de saída por
   * insumo que ELE consumiu (mantém a rastreabilidade por origem — nunca
   * mistura o consumo de pedidos diferentes num movimento só) e marca o
   * pedido como baixado. Um pedido sem nenhum insumo configurado não gera
   * movimento nenhum, mas ainda é marcado como baixado — senão ficaria
   * preso na lista pra sempre.
   */
  async function fecharPedidos(selecionados: OrderWithItems[]) {
    const maps = await fetchReferenceMaps(selecionados)

    for (const order of selecionados) {
      const { porInsumo } = consumoDoPedido(order, maps)
      if (porInsumo.size > 0) {
        const { error: movErr } = await supabase.from('movimentacoes_estoque').insert(
          [...porInsumo.entries()].map(([insumo_id, quantidade]) => ({
            insumo_id,
            quantidade: -quantidade,
            tipo: 'saida_venda' as const,
            origem_tipo: 'order',
            origem_id: order.id,
            criado_por: currentUserId,
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
    await fetchAll()
  }

  return { orders, loading, error, calcularConsumo, fecharPedidos }
}
