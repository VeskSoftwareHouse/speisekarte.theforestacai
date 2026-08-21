import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { ORDER_STATUS_FLOW } from '@shared/types'
import type { OrderItem, OrderWithItems } from '@shared/types'
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
 * novo, o corte caía justamente sobre o pedido que acabou de ser pago. Um dia
 * de cada vez não tem esse teto, e o calendário recebe só a contagem do mês.
 */
export function useOrders(selectedDateKey: string, viewedMonthKey: string): UseOrdersResult {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [orderCountByDate, setOrderCountByDate] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const hasLoadedOnce = useRef(false)

  // Cada carga recebe um número: se a equipe trocar de dia no meio, a resposta
  // antiga se cala em vez de sobrescrever a nova.
  const generation = useRef(0)

  const { dayStartIso, dayEndIso, monthStartIso, monthEndIso } = useMemo(() => {
    const day = dateKeyToDate(selectedDateKey)
    const month = monthKeyToDate(viewedMonthKey)
    return {
      dayStartIso: day.toISOString(),
      dayEndIso: endOfDay(day).toISOString(),
      monthStartIso: month.toISOString(),
      monthEndIso: endOfMonth(month).toISOString(),
    }
  }, [selectedDateKey, viewedMonthKey])

  const fetchAll = useCallback(async () => {
    const mine = ++generation.current

    try {
      const [dayRows, monthRows] = await Promise.all([
        // Itens vêm embutidos: em consultas separadas, o teto de linhas cai
        // sobre cada uma por conta própria, e a comanda chegaria sem os itens.
        fetchPaged<OrderRow>((from, to) =>
          supabase
            .from('orders')
            .select('*, order_items(*)')
            .in('status', KITCHEN_STATUSES)
            .gte('criado_em', dayStartIso)
            .lte('criado_em', dayEndIso)
            .order('criado_em', { ascending: true })
            .range(from, to),
        ),
        fetchPaged<{ criado_em: string }>((from, to) =>
          supabase
            .from('orders')
            .select('criado_em')
            .in('status', KITCHEN_STATUSES)
            .gte('criado_em', monthStartIso)
            .lte('criado_em', monthEndIso)
            .range(from, to),
        ),
      ])

      if (generation.current !== mine) return

      const counts: Record<string, number> = {}
      for (const row of monthRows) {
        const key = isoToDateKey(row.criado_em)
        counts[key] = (counts[key] ?? 0) + 1
      }

      setOrders(dayRows.map(({ order_items, ...order }) => ({ ...order, items: order_items ?? [] })))
      setOrderCountByDate(counts)
      setError(null)
      hasLoadedOnce.current = true
    } catch (err) {
      if (generation.current !== mine) return
      setError(err instanceof Error ? err.message : 'Falha ao carregar os pedidos.')
    } finally {
      if (generation.current === mine) setLoading(false)
    }
  }, [dayStartIso, dayEndIso, monthStartIso, monthEndIso])

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('equipe-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const id = (payload.new as { id: string }).id
        if (hasLoadedOnce.current) {
          setNewOrderIds((prev) => new Set(prev).add(id))
        }
        fetchAll()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        fetchAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, () => {
        fetchAll()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchAll])

  const markSeen = useCallback((orderId: string) => {
    setNewOrderIds((prev) => {
      if (!prev.has(orderId)) return prev
      const next = new Set(prev)
      next.delete(orderId)
      return next
    })
  }, [])

  const advanceStatus = useCallback(async (order: OrderWithItems) => {
    const idx = ORDER_STATUS_FLOW.indexOf(order.status)
    const nextStatus = ORDER_STATUS_FLOW[idx + 1]
    if (!nextStatus) return
    await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id)
  }, [])

  return { orders, orderCountByDate, loading, error, newOrderIds, markSeen, advanceStatus }
}
