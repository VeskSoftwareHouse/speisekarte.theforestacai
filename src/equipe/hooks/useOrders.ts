import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { ORDER_STATUS_FLOW } from '@shared/types'
import type { OrderItem, OrderStatus, OrderWithItems } from '@shared/types'
import { dateKeyToDate, endOfDay, endOfMonth, isoToDateKey, monthKeyToDate } from '../dateUtils'
import { fetchPaged } from './fetchPaged'

/** aguardando_pagamento/cancelado nunca chegam ao quadro da cozinha. */
const KITCHEN_STATUSES = ORDER_STATUS_FLOW

interface UseOrdersResult {
  /** Pedidos do dia selecionado, com os itens. */
  orders: OrderWithItems[]
  /** Quantos pedidos por data no mês aberto no calendário, para os pontinhos. */
  orderCountByDate: Record<string, number>
  loading: boolean
  error: string | null
  newOrderIds: Set<string>
  markSeen: (orderId: string) => void
  advanceStatus: (order: OrderWithItems) => Promise<void>
}

interface OrderRow extends Omit<OrderWithItems, 'items'> {
  order_items?: OrderItem[]
}

/**
 * Pedidos do quadro da cozinha, sincronizados via Supabase Realtime
 * (subscription em INSERT/UPDATE de `orders` e INSERT de `order_items`).
 * Sem polling: qualquer mudança no banco reflete na tela automaticamente.
 *
 * A busca é do dia escolhido, não do histórico inteiro. Antes vinha tudo que
 * já passou pela cozinha de uma vez, o que funcionou enquanto a loja tinha
 * poucas centenas de pedidos e quebrou em silêncio ao passar de mil: o
 * PostgREST cortava a resposta e, como a ordem era do mais antigo para o mais
 * novo, o corte caía justamente sobre o pedido que acabou de ser pago.
 *
 * Dia e contagem do mês são duas buscas independentes de propósito. Trocar de
 * dia dentro do mesmo mês não mexe nos pontinhos do calendário, então recarregá
 * -los seria uma ida ao servidor a mais em cima do clique que a equipe mais dá.
 */
export function useOrders(selectedDateKey: string, viewedMonthKey: string): UseOrdersResult {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [orderCountByDate, setOrderCountByDate] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const hasLoadedOnce = useRef(false)

  // Cada carga do dia recebe um número: se a equipe trocar de dia no meio, a
  // resposta antiga se cala em vez de sobrescrever a nova.
  const generation = useRef(0)

  /**
   * Avanços de status já aplicados na tela e ainda não confirmados pelo banco.
   * Sem isto, uma recarga disparada por outro evento poderia chegar com o
   * status antigo e fazer o card pular de volta para a coluna anterior.
   */
  const pendingStatus = useRef(new Map<string, OrderStatus>())

  const { dayStartIso, dayEndIso } = useMemo(() => {
    const day = dateKeyToDate(selectedDateKey)
    return { dayStartIso: day.toISOString(), dayEndIso: endOfDay(day).toISOString() }
  }, [selectedDateKey])

  const { monthStartIso, monthEndIso } = useMemo(() => {
    const month = monthKeyToDate(viewedMonthKey)
    return { monthStartIso: month.toISOString(), monthEndIso: endOfMonth(month).toISOString() }
  }, [viewedMonthKey])

  const fetchDay = useCallback(async () => {
    const mine = ++generation.current
    try {
      // Itens vêm embutidos: em consultas separadas, o teto de linhas cai
      // sobre cada uma por conta própria, e a comanda chegaria sem os itens.
      const rows = await fetchPaged<OrderRow>((from, to) =>
        supabase
          .from('orders')
          .select('*, order_items(*)')
          .in('status', KITCHEN_STATUSES)
          .gte('criado_em', dayStartIso)
          .lte('criado_em', dayEndIso)
          .order('criado_em', { ascending: true })
          .range(from, to),
      )
      if (generation.current !== mine) return

      setOrders(
        rows.map(({ order_items, ...order }) => {
          const assembled: OrderWithItems = { ...order, items: order_items ?? [] }
          const wanted = pendingStatus.current.get(order.id)
          if (!wanted) return assembled
          // O banco alcançou a tela: o avanço deixa de ser provisório.
          if (assembled.status === wanted) {
            pendingStatus.current.delete(order.id)
            return assembled
          }
          return { ...assembled, status: wanted }
        }),
      )
      setError(null)
      hasLoadedOnce.current = true
    } catch (err) {
      if (generation.current !== mine) return
      setError(err instanceof Error ? err.message : 'Falha ao carregar os pedidos.')
    } finally {
      if (generation.current === mine) setLoading(false)
    }
  }, [dayStartIso, dayEndIso])

  const fetchMonthCounts = useCallback(async () => {
    try {
      const rows = await fetchPaged<{ criado_em: string }>((from, to) =>
        supabase
          .from('orders')
          .select('criado_em')
          .in('status', KITCHEN_STATUSES)
          .gte('criado_em', monthStartIso)
          .lte('criado_em', monthEndIso)
          .range(from, to),
      )
      const counts: Record<string, number> = {}
      for (const row of rows) {
        const key = isoToDateKey(row.criado_em)
        counts[key] = (counts[key] ?? 0) + 1
      }
      setOrderCountByDate(counts)
    } catch {
      // Os pontinhos do calendário são enfeite: falhar neles não vale um erro
      // vermelho por cima do quadro de pedidos, que carrega por conta própria.
    }
  }, [monthStartIso, monthEndIso])

  useEffect(() => {
    setLoading(true)
    fetchDay()
  }, [fetchDay])

  useEffect(() => {
    fetchMonthCounts()
  }, [fetchMonthCounts])

  // O canal do Realtime é assinado uma vez só. Com as funções de busca em refs,
  // trocar de dia não derruba e reassina a conexão.
  const latest = useRef({ fetchDay, fetchMonthCounts })
  useEffect(() => {
    latest.current = { fetchDay, fetchMonthCounts }
  }, [fetchDay, fetchMonthCounts])

  useEffect(() => {
    const refetch = () => {
      latest.current.fetchDay()
      latest.current.fetchMonthCounts()
    }

    const channel = supabase
      .channel('equipe-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const id = (payload.new as { id: string }).id
        if (hasLoadedOnce.current) {
          setNewOrderIds((prev) => new Set(prev).add(id))
        }
        refetch()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, refetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, () =>
        latest.current.fetchDay(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const markSeen = useCallback((orderId: string) => {
    setNewOrderIds((prev) => {
      if (!prev.has(orderId)) return prev
      const next = new Set(prev)
      next.delete(orderId)
      return next
    })
  }, [])

  /**
   * O card muda de coluna no clique, antes de o banco responder.
   *
   * Esperar a confirmação custava a ida da escrita, a volta do aviso do
   * Realtime e ainda a recarga que ele dispara — quase um segundo entre tocar
   * no botão e ver o pedido andar, com a equipe de mãos ocupadas no balcão.
   * Se a escrita falhar, o card volta para onde estava e o erro aparece.
   */
  const advanceStatus = useCallback(async (order: OrderWithItems) => {
    const idx = ORDER_STATUS_FLOW.indexOf(order.status)
    const nextStatus = ORDER_STATUS_FLOW[idx + 1]
    if (!nextStatus) return

    pendingStatus.current.set(order.id, nextStatus)
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)))

    const { error: updateError } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id)
    if (updateError) {
      pendingStatus.current.delete(order.id)
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: order.status } : o)))
      setError(updateError.message)
    }
  }, [])

  return { orders, orderCountByDate, loading, error, newOrderIds, markSeen, advanceStatus }
}
