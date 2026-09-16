import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { OrderItem, ReportOrder } from '@shared/types'
import { baixarEstoqueDoPedido, fechamentoAutomaticoAtivo } from '../estoqueConsumo'

interface TwintOrderRow extends Omit<ReportOrder, 'items'> {
  order_items?: OrderItem[]
}

/**
 * Pedidos pagos por Twint, aguardando a equipe conferir o recebimento no
 * celular do caixa. Mesmo esquema do useCashPendingOrders — independente do
 * dia selecionado no calendário, é sempre "agora".
 */
export function useTwintPendingOrders(currentUserId: string) {
  const [orders, setOrders] = useState<ReportOrder[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    const { data, error: err } = await retryLoad(
      () =>
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('status', 'aguardando_twint')
          .order('criado_em', { ascending: true }),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    setOrders(
      ((data ?? []) as TwintOrderRow[]).map(({ order_items, ...order }) => ({
        ...order,
        items: order_items ?? [],
      })) as ReportOrder[],
    )
  }, [])

  useEffect(() => {
    fetchPending()

    const channel = supabase
      .channel('equipe-twint-pending-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchPending)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchPending])

  /**
   * Confirma o recebimento e destrava o pedido pra cozinha: vira "recebido",
   * igual a um pagamento por cartão ou dinheiro confirmado.
   */
  const confirmTwint = useCallback(
    async (orderId: string) => {
      const { error: err } = await supabase
        .from('orders')
        .update({ status: 'recebido', forma_pagamento: 'Twint' })
        .eq('id', orderId)
      if (err) throw new Error(err.message)

      try {
        const order = orders.find((o) => o.id === orderId)
        if (order && (await fechamentoAutomaticoAtivo(supabase))) {
          await baixarEstoqueDoPedido(supabase, order, currentUserId)
        }
      } catch {
        // silencioso — ver comentário equivalente em useCashPendingOrders
      }
    },
    [orders, currentUserId],
  )

  return { orders, error, confirmTwint }
}
