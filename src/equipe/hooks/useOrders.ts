import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { ORDER_STATUS_FLOW } from '@shared/types'
import type { OrderItem, OrderStatus, OrderWithItems } from '@shared/types'
import { dateKeyToDate, endOfDay, endOfMonth, isoToDateKey, monthKeyToDate } from '../dateUtils'
import { fetchPaged } from './fetchPaged'
import { useLiveRefetch } from './useLiveRefetch'

/**
 * aguardando_pagamento/cancelado nunca chegam ao quadro da cozinha. Pedido em
 * dinheiro chega já na criação: a comanda aparece com a tarja "Pagamento
 * pendente" até a equipe confirmar o troco (ver OrderCard).
 */
const KITCHEN_STATUSES = [...ORDER_STATUS_FLOW, 'aguardando_dinheiro']

interface UseOrdersResult {
  /** Pedidos do dia selecionado, com os itens. */
  orders: OrderWithItems[]
  /** Quantos pedidos por data no mês aberto no calendário, para os pontinhos. */
  orderCountByDate: Record<string, number>
  loading: boolean
  error: string | null
  /** Estado real do canal do Realtime — é o que o "Ao vivo" do cabeçalho mostra. */
  realtimeConnected: boolean
  newOrderIds: Set<string>
  markSeen: (orderId: string) => void
  advanceStatus: (order: OrderWithItems) => Promise<void>
  excluirPedido: (order: OrderWithItems, criadoPor: string | null) => Promise<void>
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
  const [realtimeConnected, setRealtimeConnected] = useState(false)
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
          const pendingCash = (order.status as string) === 'aguardando_dinheiro'
          const assembled: OrderWithItems = {
            ...order,
            status: pendingCash ? 'recebido' : order.status,
            aguardandoDinheiro: pendingCash,
            items: order_items ?? [],
          }
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, refetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, () =>
        latest.current.fetchDay(),
      )
      // Antes o "Ao vivo" do cabeçalho olhava só se a última busca por REST
      // tinha dado erro — o canal podia cair (wifi, tablet dormindo) sem que
      // nada disso mudasse, e a equipe seguia vendo "Ao vivo" enquanto
      // pedidos novos paravam de chegar. Isto reflete o estado real do
      // WebSocket; a própria lib tenta reconectar sozinha e o status volta a
      // SUBSCRIBED quando consegue.
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
      setRealtimeConnected(false)
    }
  }, [])

  // Realtime perde eventos quando o canal cai; ver useLiveRefetch.
  useLiveRefetch(() => {
    latest.current.fetchDay()
    latest.current.fetchMonthCounts()
  }, 15_000, realtimeConnected)

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
    // Pedido com pagamento pendente só anda depois de confirmado o troco.
    if (!nextStatus || order.aguardandoDinheiro) return

    pendingStatus.current.set(order.id, nextStatus)
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)))

    const { error: updateError } = await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id)
    if (updateError) {
      pendingStatus.current.delete(order.id)
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: order.status } : o)))
      setError(updateError.message)
    }
  }, [])

  /**
   * Apaga um pedido de teste (e os itens dele, em cascata) — não é uma ação
   * de operação normal, é pra tirar da tela e dos relatórios um pedido que
   * nunca devia ter existido. Se o estoque já tinha sido baixado por ele
   * (order.estoque_baixado), o insumo é estornado com um lançamento de
   * entrada ANTES de apagar — movimentacoes_estoque nunca é editada nem
   * apagada (é a trilha de auditoria, ver comentário na tabela), só
   * compensada, então o motivo de cada baixa continua visível depois.
   */
  const excluirPedido = useCallback(async (order: OrderWithItems, criadoPor: string | null) => {
    setOrders((prev) => prev.filter((o) => o.id !== order.id))

    try {
      if (order.estoque_baixado) {
        const { data: movimentos, error: movErr } = await supabase
          .from('movimentacoes_estoque')
          .select('insumo_id, quantidade')
          .eq('origem_tipo', 'order')
          .eq('origem_id', order.id)
        if (movErr) throw new Error(movErr.message)
        if (movimentos && movimentos.length > 0) {
          const { error: estornoErr } = await supabase.from('movimentacoes_estoque').insert(
            (movimentos as { insumo_id: string; quantidade: number }[]).map((m) => ({
              insumo_id: m.insumo_id,
              quantidade: -m.quantidade,
              tipo: 'entrada_ajuste_inventario' as const,
              origem_tipo: 'exclusao_pedido_teste',
              origem_id: order.id,
              observacoes: `Estorno automático: pedido de teste excluído.`,
              criado_por: criadoPor,
            })),
          )
          if (estornoErr) throw new Error(estornoErr.message)
        }
      }

      const { error: delErr } = await supabase.from('orders').delete().eq('id', order.id)
      if (delErr) throw new Error(delErr.message)
    } catch (err) {
      // Falhou: devolve o card pra tela em vez de deixar sumido sem apagar de verdade.
      setOrders((prev) => [...prev, order].sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1)))
      setError(err instanceof Error ? err.message : 'Não foi possível excluir o pedido.')
    }
  }, [])

  return {
    orders,
    orderCountByDate,
    loading,
    error,
    realtimeConnected,
    newOrderIds,
    markSeen,
    advanceStatus,
    excluirPedido,
  }
}
