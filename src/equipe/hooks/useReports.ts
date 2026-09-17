import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { Imposto, Insumo, OrderItem, ReportOrder } from '@shared/types'
import { addMonths, endOfDay, startOfMonth } from '../dateUtils'
import { fetchReferenceMaps, type ReferenceMaps } from '../estoqueConsumo'
import { custoMedioPorInsumo, type CustoMedioInsumo, type ItemCompraRecebida } from '../lucroCalc'
import type { Period, ReportCategory, ReportMenuItem, TrendOrder } from '../reportMetrics'
import { PAID_STATUSES, previousPeriod } from '../reportMetrics'
import { fetchPaged } from './fetchPaged'

/** Quantos meses o gráfico de tendência mostra, sempre terminando no mês atual. */
export const TREND_MONTHS = 12

export interface ReportData {
  /** Pedidos do período escolhido, com os itens — a base de quase todo relatório. */
  orders: ReportOrder[]
  /** Mesmo período, deslocado para trás: alimenta o "vs período anterior". */
  previousOrders: ReportOrder[]
  /** Últimos meses, sem itens: alimenta só o gráfico de tendência. */
  trendOrders: TrendOrder[]
  menuItems: ReportMenuItem[]
  categories: ReportCategory[]
  /** Composição dos produtos e vínculo dos adicionais usados no período — a
   * configuração ATUAL, não a de quando cada pedido foi feito (mesmo espírito
   * do Fechamento). Alimenta a margem por produto. */
  maps: ReferenceMaps
  /** Custo médio por insumo, calculado das compras já recebidas com o
   * imposto de hoje aplicado. Um insumo nunca comprado não aparece aqui. */
  custoPorInsumo: Map<string, CustoMedioInsumo>
  /** Nome e unidade dos insumos — só o suficiente pra rotular o
   * detalhamento por insumo da margem por produto. */
  insumoById: Map<string, Pick<Insumo, 'nome' | 'unidade'>>
  loading: boolean
  error: string | null
  /** Recarrega tudo. Os relatórios não escutam o Realtime: quem olha um mês fechado não quer a tela se mexendo sozinha. */
  reload: () => void
}

const EMPTY_MAPS: ReferenceMaps = {
  composicaoPorItem: new Map(),
  menuItemNomeById: new Map(),
  optionById: new Map(),
}

interface OrderRow extends Omit<ReportOrder, 'items'> {
  order_items?: OrderItem[]
}

/**
 * Carrega tudo que a tela de relatórios precisa para um período: os pedidos do
 * período (com itens), os do período anterior e os dos últimos doze meses (só
 * os totais, sem itens), mais o cardápio atual — que é de onde saem categoria
 * e a marca de "montado pelo cliente" de cada produto.
 *
 * Só pedidos pagos, e o filtro fica na consulta em vez de na conta: assim não
 * há como um carrinho abandonado escapar para dentro de alguma métrica nova
 * que esqueça de peneirar.
 */
export function useReports(period: Period): ReportData {
  const [orders, setOrders] = useState<ReportOrder[]>([])
  const [previousOrders, setPreviousOrders] = useState<ReportOrder[]>([])
  const [trendOrders, setTrendOrders] = useState<TrendOrder[]>([])
  const [menuItems, setMenuItems] = useState<ReportMenuItem[]>([])
  const [categories, setCategories] = useState<ReportCategory[]>([])
  const [maps, setMaps] = useState<ReferenceMaps>(EMPTY_MAPS)
  const [custoPorInsumo, setCustoPorInsumo] = useState<Map<string, CustoMedioInsumo>>(new Map())
  const [insumoById, setInsumoById] = useState<Map<string, Pick<Insumo, 'nome' | 'unidade'>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Cada carga recebe um número; se o usuário trocar de período no meio, a
  // resposta antiga se cala em vez de sobrescrever a nova (mesmo cuidado do
  // useMenu do App da Mesa).
  const generation = useRef(0)

  const startIso = period.start.toISOString()
  const endIso = period.end.toISOString()

  const previous = useMemo(() => previousPeriod(period), [period])
  const previousStartIso = previous.start.toISOString()
  const previousEndIso = previous.end.toISOString()

  const load = useCallback(async () => {
    const mine = ++generation.current
    setLoading(true)

    // A tendência é sempre "os últimos doze meses até hoje", independente do
    // período escolhido na tela — é o gráfico de acompanhamento do negócio.
    const now = new Date()
    const trendStart = addMonths(startOfMonth(now), -(TREND_MONTHS - 1))
    const trendEnd = endOfDay(now)

    const withItems = (from: number, to: number, gte: string, lte: string) =>
      supabase
        .from('orders')
        .select('*, order_items(*)')
        .in('status', PAID_STATUSES)
        .gte('criado_em', gte)
        .lte('criado_em', lte)
        .order('criado_em', { ascending: true })
        .range(from, to)

    try {
      const [orderRows, previousRows, trendRows, itemRows, categoryRows, impostoRows, comprasRows, insumoRows] = await Promise.all([
        fetchPaged<OrderRow>((from, to) => withItems(from, to, startIso, endIso)),
        // O período anterior também vem com itens: um pedido sem `valor_pago`
        // gravado só pode ser somado pelo que tem dentro, e sem isso ele
        // entraria no comparativo valendo zero.
        fetchPaged<OrderRow>((from, to) => withItems(from, to, previousStartIso, previousEndIso)),
        fetchPaged<TrendOrder>((from, to) =>
          supabase
            .from('orders')
            .select('criado_em, status, valor_pago, gorjeta')
            .in('status', PAID_STATUSES)
            .gte('criado_em', trendStart.toISOString())
            .lte('criado_em', trendEnd.toISOString())
            .order('criado_em', { ascending: true })
            .range(from, to),
        ),
        fetchPaged<ReportMenuItem>((from, to) =>
          supabase
            .from('menu_items')
            .select('id, nome, categoria_id, max_ingredientes, disponivel')
            .order('ordem')
            .range(from, to),
        ),
        fetchPaged<ReportCategory>((from, to) =>
          supabase.from('categories').select('id, nome').order('ordem').range(from, to),
        ),
        fetchPaged<Imposto>((from, to) => supabase.from('impostos').select('*').range(from, to)),
        // Custo por insumo vem só das compras JÁ RECEBIDAS — um pedido de
        // compra ainda em rascunho não é um preço pago de verdade.
        fetchPaged<{ pedido_compra_itens: ItemCompraRecebida[] | null }>((from, to) =>
          supabase
            .from('pedidos_compra')
            .select('pedido_compra_itens(insumo_id, quantidade, valor_unitario)')
            .eq('status', 'recebido')
            .range(from, to),
        ),
        fetchPaged<Pick<Insumo, 'id' | 'nome' | 'unidade'>>((from, to) =>
          supabase.from('insumos').select('id, nome, unidade').range(from, to),
        ),
      ])

      if (generation.current !== mine) return

      const assemble = (rows: OrderRow[]): ReportOrder[] =>
        rows.map(({ order_items, ...order }) => ({ ...order, items: order_items ?? [] }))

      const assembledOrders = assemble(orderRows)
      // Composição e vínculo de adicionais são a configuração ATUAL, aplicada
      // a todo o período — mesmo espírito do Fechamento (nunca uma foto do
      // que era no momento da venda).
      const referenceMaps = await fetchReferenceMaps(supabase, assembledOrders)
      const itensCompraRecebida = comprasRows.flatMap((p) => p.pedido_compra_itens ?? [])

      setOrders(assembledOrders)
      setPreviousOrders(assemble(previousRows))
      setTrendOrders(trendRows)
      setMenuItems(itemRows)
      setCategories(categoryRows)
      setMaps(referenceMaps)
      setCustoPorInsumo(custoMedioPorInsumo(itensCompraRecebida, impostoRows))
      setInsumoById(new Map(insumoRows.map((i) => [i.id, { nome: i.nome, unidade: i.unidade }])))
      setError(null)
    } catch (err) {
      if (generation.current !== mine) return
      setError(err instanceof Error ? err.message : 'Falha ao carregar os relatórios.')
    } finally {
      if (generation.current === mine) setLoading(false)
    }
  }, [startIso, endIso, previousStartIso, previousEndIso])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  return { orders, previousOrders, trendOrders, menuItems, categories, maps, custoPorInsumo, insumoById, loading, error, reload }
}
