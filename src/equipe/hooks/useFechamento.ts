import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { OrderItem, OrderWithItems } from '@shared/types'
import { baixarEstoqueDoPedido, consumoDoPedido, fetchReferenceMaps } from '../estoqueConsumo'

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
          .not('status', 'in', '(aguardando_pagamento,aguardando_dinheiro,aguardando_twint,cancelado)')
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

  /** Prévia do lote inteiro, para mostrar antes de confirmar o fechamento. */
  async function calcularConsumo(selecionados: OrderWithItems[]): Promise<ConsumoPreview> {
    const maps = await fetchReferenceMaps(supabase, selecionados)
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
    for (const order of selecionados) {
      await baixarEstoqueDoPedido(supabase, order, currentUserId)
    }
    await fetchAll()
  }

  return { orders, loading, error, calcularConsumo, fecharPedidos }
}
