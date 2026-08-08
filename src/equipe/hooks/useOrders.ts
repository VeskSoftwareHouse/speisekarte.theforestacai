import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { ORDER_STATUS_FLOW } from '@shared/types'
import type { OrderItem, OrderWithItems, RestaurantTable } from '@shared/types'

interface UseOrdersResult {
  orders: OrderWithItems[]
  loading: boolean
  error: string | null
  newOrderIds: Set<string>
  markSeen: (orderId: string) => void
  advanceStatus: (order: OrderWithItems) => Promise<void>
}

/**
 * Busca pedidos + itens, e mantém tudo sincronizado via Supabase Realtime
 * (subscription em INSERT/UPDATE de `orders` e INSERT de `order_items`).
 * Sem polling: qualquer mudança no banco reflete na tela automaticamente.
 */
export function useOrders(): UseOrdersResult {
  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const hasLoadedOnce = useRef(false)

  const fetchAll = useCallback(async () => {
    const [tablesRes, ordersRes, itemsRes] = await Promise.all([
      supabase.from('tables').select('*'),
      supabase.from('orders').select('*').order('criado_em', { ascending: true }),
      supabase.from('order_items').select('*'),
    ])

    const firstError = tablesRes.error ?? ordersRes.error ?? itemsRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    const tablesById: Record<string, RestaurantTable> = {}
    for (const t of tablesRes.data ?? []) tablesById[t.id] = t

    const itemsByOrder: Record<string, OrderItem[]> = {}
    for (const it of itemsRes.data ?? []) {
      ;(itemsByOrder[it.order_id] ??= []).push(it)
    }

    const assembled: OrderWithItems[] = (ordersRes.data ?? []).map((o) => ({
      ...o,
      table: tablesById[o.table_id] ?? null,
      items: itemsByOrder[o.id] ?? [],
    }))

    setOrders(assembled)
    setError(null)
    setLoading(false)
    hasLoadedOnce.current = true
  }, [])

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

  return { orders, loading, error, newOrderIds, markSeen, advanceStatus }
}
