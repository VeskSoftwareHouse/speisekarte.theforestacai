import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { PedidoCompraItem, PedidoCompraStatus, PedidoCompraWithItens } from '@shared/types'

export interface PedidoCompraItemInput {
  insumo_id: string
  quantidade: number
  valor_unitario: number | null
}

export interface PedidoCompraInput {
  fornecedor_id: string
  status: PedidoCompraStatus
  observacoes: string | null
}

interface PedidoRow extends Omit<PedidoCompraWithItens, 'itens'> {
  pedido_compra_itens?: PedidoCompraItem[]
}

/**
 * Pedidos de compra a fornecedores. Mesma forma dos outros painéis de
 * administração (carrega tudo, recarrega depois de cada escrita), com duas
 * ações extras que têm efeito colateral em estoque: `receberPedido` (grava
 * as entradas) e `cancelarPedido` (só muda o status, nunca mexeu no estoque
 * porque ainda não foi recebido).
 */
export function useComprasAdmin(currentUserId: string) {
  const [pedidos, setPedidos] = useState<PedidoCompraWithItens[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () => supabase.from('pedidos_compra').select('*, pedido_compra_itens(*)').order('criado_em', { ascending: false }),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setPedidos(
      ((data ?? []) as PedidoRow[]).map(({ pedido_compra_itens, ...pedido }) => ({
        ...pedido,
        itens: pedido_compra_itens ?? [],
      })),
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createPedido(input: PedidoCompraInput, itens: PedidoCompraItemInput[]) {
    const { data: pedido, error: err } = await supabase.from('pedidos_compra').insert(input).select().single()
    if (err) throw new Error(err.message)
    if (itens.length > 0) {
      const { error: itemsErr } = await supabase
        .from('pedido_compra_itens')
        .insert(itens.map((it) => ({ ...it, pedido_compra_id: pedido.id })))
      if (itemsErr) {
        await supabase.from('pedidos_compra').delete().eq('id', pedido.id)
        throw new Error(itemsErr.message)
      }
    }
    await fetchAll()
  }

  async function updatePedido(id: string, input: PedidoCompraInput, itens: PedidoCompraItemInput[]) {
    const { error: err } = await supabase.from('pedidos_compra').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    const { error: delErr } = await supabase.from('pedido_compra_itens').delete().eq('pedido_compra_id', id)
    if (delErr) throw new Error(delErr.message)
    if (itens.length > 0) {
      const { error: insErr } = await supabase
        .from('pedido_compra_itens')
        .insert(itens.map((it) => ({ ...it, pedido_compra_id: id })))
      if (insErr) throw new Error(insErr.message)
    }
    await fetchAll()
  }

  async function deletePedido(id: string) {
    const { error: err } = await supabase.from('pedidos_compra').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  /**
   * Confirma o recebimento: grava as entradas em movimentacoes_estoque —
   * uma por item, tudo num único insert (ou tudo entra, ou nada entra) — e
   * só então marca o pedido como recebido. Usa os itens que já estão no
   * estado (não reconsulta o banco), pra nunca haver diferença entre o que
   * a equipe vê na tela e o que vira movimento de estoque.
   */
  async function receberPedido(pedido: PedidoCompraWithItens) {
    if (pedido.itens.length > 0) {
      const { error: movErr } = await supabase.from('movimentacoes_estoque').insert(
        pedido.itens.map((it) => ({
          insumo_id: it.insumo_id,
          quantidade: it.quantidade,
          tipo: 'entrada_compra' as const,
          origem_tipo: 'pedido_compra',
          origem_id: pedido.id,
          criado_por: currentUserId,
        })),
      )
      if (movErr) throw new Error(movErr.message)
    }
    const { error: err } = await supabase
      .from('pedidos_compra')
      .update({ status: 'recebido', recebido_em: new Date().toISOString() })
      .eq('id', pedido.id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function cancelarPedido(id: string) {
    const { error: err } = await supabase.from('pedidos_compra').update({ status: 'cancelado' }).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { pedidos, loading, error, createPedido, updatePedido, deletePedido, receberPedido, cancelarPedido }
}
