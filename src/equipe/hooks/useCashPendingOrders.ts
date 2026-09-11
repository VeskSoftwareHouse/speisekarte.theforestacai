import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { OrderItem, ReportOrder } from '@shared/types'
import { baixarEstoqueDoPedido, fechamentoAutomaticoAtivo } from '../estoqueConsumo'

interface CashOrderRow extends Omit<ReportOrder, 'items'> {
  order_items?: OrderItem[]
}

/**
 * Pedidos pagos em dinheiro, aguardando a equipe conferir o troco no caixa.
 * Independente do dia selecionado no calendário (ver useOrders) — é sempre
 * "agora", não histórico: um cliente parado no caixa não espera a equipe
 * lembrar de olhar a data certa.
 */
export function useCashPendingOrders(currentUserId: string) {
  const [orders, setOrders] = useState<ReportOrder[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    const { data, error: err } = await retryLoad(
      () =>
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('status', 'aguardando_dinheiro')
          .order('criado_em', { ascending: true }),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      return
    }
    setError(null)
    setOrders(
      ((data ?? []) as CashOrderRow[]).map(({ order_items, ...order }) => ({
        ...order,
        items: order_items ?? [],
      })) as ReportOrder[],
    )
  }, [])

  useEffect(() => {
    fetchPending()

    const channel = supabase
      .channel('equipe-cash-pending-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchPending)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchPending])

  /**
   * Confirma o troco e destrava o pedido pra cozinha: vira "recebido", igual
   * a um pagamento por cartão confirmado — o gatilho do banco carimba
   * `pago_em` na mesma transição, então os relatórios não precisam saber que
   * este pedido tomou um caminho diferente até aqui.
   */
  const confirmCash = useCallback(
    async (orderId: string, valorRecebidoDinheiro: number) => {
      const { error: err } = await supabase
        .from('orders')
        .update({
          status: 'recebido',
          forma_pagamento: 'Dinheiro',
          valor_recebido_dinheiro: valorRecebidoDinheiro,
        })
        .eq('id', orderId)
      if (err) throw new Error(err.message)

      // Baixa automática é conveniência, não pode derrubar a confirmação de
      // pagamento que já aconteceu de verdade — se falhar, a equipe sempre
      // pode fechar esse pedido manualmente depois em Estoque → Fechamento.
      try {
        const order = orders.find((o) => o.id === orderId)
        if (order && (await fechamentoAutomaticoAtivo(supabase))) {
          await baixarEstoqueDoPedido(supabase, order, currentUserId)
        }
      } catch {
        // silencioso, ver comentário acima
      }
    },
    [orders, currentUserId],
  )

  return { orders, error, confirmCash }
}
