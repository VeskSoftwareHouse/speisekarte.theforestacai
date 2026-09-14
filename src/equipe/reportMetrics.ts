import { isPaidStatus } from '@shared/types'
import type { Category, FullOrderStatus, MenuItem, OrderItem, ReportOrder, SelectedModifierOption } from '@shared/types'
import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  formatDateBR,
  shortMonthLabel,
  startOfDay,
  startOfMonth,
  toMonthKey,
} from './dateUtils'

/**
 * Cálculo dos relatórios do Painel da Equipe. Tudo aqui é função pura sobre a
 * lista de pedidos já carregada — a tela só escolhe o período e desenha o
 * resultado. Manter separado da UI é o que permite conferir uma conta sem
 * abrir o React, e reaproveitar as mesmas contas na exportação em CSV.
 */

/**
 * Os relatórios só olham para pedidos pagos — carrinho abandonado e cartão
 * recusado não são venda, e misturá-los a qualquer contagem só torna o número
 * mais difícil de explicar. A lista dos status vem de `@shared/types`.
 */
export { PAID_STATUSES } from '@shared/types'

export function isPaid(order: { status: FullOrderStatus }): boolean {
  return isPaidStatus(order.status)
}

/** Só o que o cálculo dos relatórios precisa saber de um produto do cardápio. */
export type ReportMenuItem = Pick<MenuItem, 'id' | 'nome' | 'categoria_id' | 'max_ingredientes' | 'disponivel'>
export type ReportCategory = Pick<Category, 'id' | 'nome'>

/** Pedido "magro" usado só na tendência mensal, que não precisa dos itens. */
export type TrendOrder = Pick<ReportOrder, 'criado_em' | 'status' | 'valor_pago' | 'gorjeta'>

/**
 * PostgREST devolve `numeric` como número, mas um valor nulo (pedido antigo,
 * gorjeta ausente) ou uma string vinda de outro caminho quebrariam a soma
 * silenciosamente — melhor normalizar na entrada de toda conta.
 */
function num(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  return Number.isFinite(n) ? n : 0
}

// =====================================================================
// Período
// =====================================================================

export type PeriodPresetId = 'hoje' | 'ontem' | 'sete_dias' | 'trinta_dias' | 'mes' | 'mes_passado' | 'custom'

export interface Period {
  preset: PeriodPresetId
  /** Primeiro instante do período (meia-noite do dia inicial). */
  start: Date
  /** Último instante do período (23:59:59.999 do dia final). */
  end: Date
}

export const PERIOD_PRESETS: { id: PeriodPresetId; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: 'sete_dias', label: '7 dias' },
  { id: 'trinta_dias', label: '30 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: 'custom', label: 'Personalizado' },
]

/** Monta o intervalo de um atalho. `custom` usa as duas datas escolhidas na tela. */
export function resolvePeriod(
  preset: PeriodPresetId,
  customStart: Date,
  customEnd: Date,
  now: Date = new Date(),
): Period {
  switch (preset) {
    case 'hoje':
      return { preset, start: startOfDay(now), end: endOfDay(now) }
    case 'ontem': {
      const yesterday = addDays(now, -1)
      return { preset, start: startOfDay(yesterday), end: endOfDay(yesterday) }
    }
    // "7 dias" inclui hoje: são os 7 dias que a loja acabou de viver, não os
    // 7 anteriores a hoje — é assim que a equipe fala do movimento da semana.
    case 'sete_dias':
      return { preset, start: startOfDay(addDays(now, -6)), end: endOfDay(now) }
    case 'trinta_dias':
      return { preset, start: startOfDay(addDays(now, -29)), end: endOfDay(now) }
    case 'mes':
      return { preset, start: startOfMonth(now), end: endOfDay(now) }
    case 'mes_passado': {
      const previous = addMonths(startOfMonth(now), -1)
      return { preset, start: previous, end: endOfMonth(previous) }
    }
    case 'custom': {
      // Datas invertidas na tela não viram um período vazio: a gente ordena.
      const [a, b] = customStart <= customEnd ? [customStart, customEnd] : [customEnd, customStart]
      return { preset, start: startOfDay(a), end: endOfDay(b) }
    }
  }
}

/**
 * Período imediatamente anterior, do mesmo tamanho — a base do "vs período
 * anterior". Nos atalhos de mês a comparação é com o mês-calendário anterior,
 * e não com "os mesmos N dias atrás", que é o que a equipe espera ver.
 */
export function previousPeriod(period: Period): Period {
  if (period.preset === 'mes' || period.preset === 'mes_passado') {
    const previousMonth = addMonths(startOfMonth(period.start), -1)
    // "Este mês" ainda está correndo: compara com o mesmo pedaço do mês
    // passado, senão um dia 3 sempre pareceria uma queda gigante.
    const days = Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000)
    const end = endOfDay(addDays(previousMonth, days))
    const monthEnd = endOfMonth(previousMonth)
    return { preset: period.preset, start: previousMonth, end: end < monthEnd ? end : monthEnd }
  }
  const lengthMs = period.end.getTime() - period.start.getTime()
  const end = new Date(period.start.getTime() - 1)
  return { preset: period.preset, start: new Date(end.getTime() - lengthMs), end }
}

export function periodLabel(period: Period): string {
  const start = formatDateBR(period.start)
  const end = formatDateBR(period.end)
  return start === end ? start : `${start} a ${end}`
}

export function isWithin(iso: string, period: Period): boolean {
  const t = new Date(iso).getTime()
  return t >= period.start.getTime() && t <= period.end.getTime()
}

// =====================================================================
// Vendas e faturamento
// =====================================================================

export interface SalesSummary {
  pedidos: number
  /** Tudo que entrou no caixa, gorjeta incluída. */
  faturamentoBruto: number
  gorjetas: number
  /** Faturamento sem as gorjetas — é o número que interessa para a contabilidade. */
  faturamentoLiquido: number
  /** Faturamento líquido dividido pelos pedidos pagos. */
  ticketMedio: number
  gorjetaMedia: number
  pedidosComGorjeta: number
}

export function lineTotal(item: OrderItem): number {
  return num(item.preco_unitario) * item.quantidade
}

/** Quanto o pedido movimentou. Cai na soma dos itens se `valor_pago` faltar. */
export function orderGross(order: ReportOrder): number {
  if (order.valor_pago != null) return num(order.valor_pago)
  return order.items.reduce((sum, item) => sum + lineTotal(item), 0) + num(order.gorjeta)
}

export function summarizeSales(orders: ReportOrder[]): SalesSummary {
  const paid = orders.filter(isPaid)
  let bruto = 0
  let gorjetas = 0
  let comGorjeta = 0
  for (const order of paid) {
    bruto += orderGross(order)
    const tip = num(order.gorjeta)
    gorjetas += tip
    if (tip > 0) comGorjeta++
  }
  const liquido = bruto - gorjetas
  return {
    pedidos: paid.length,
    faturamentoBruto: bruto,
    gorjetas,
    faturamentoLiquido: liquido,
    ticketMedio: paid.length ? liquido / paid.length : 0,
    gorjetaMedia: paid.length ? gorjetas / paid.length : 0,
    pedidosComGorjeta: comGorjeta,
  }
}

/**
 * Variação percentual contra o período anterior. `null` quando não havia base
 * de comparação — mostrar "+100%" onde antes não havia nada seria mentira.
 */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

// =====================================================================
// Rankings
// =====================================================================

export interface RankRow {
  key: string
  label: string
  quantidade: number
  faturamento: number
}

/**
 * O que a coluna `quantidade` de um ranking está contando. Sem isto, um
 * "12 un." embaixo de "13 pedidos pagos" se lê como 12 pedidos — e nos
 * rankings de produto ele são unidades de item, das quais um mesmo pedido
 * pode levar várias.
 */
export type RankUnit = 'itens' | 'pedidos' | 'vezes'

const RANK_UNIT_LABEL: Record<RankUnit, [singular: string, plural: string]> = {
  itens: ['item', 'itens'],
  pedidos: ['pedido', 'pedidos'],
  vezes: ['vez', 'vezes'],
}

export function formatRankQuantity(quantidade: number, unit: RankUnit): string {
  const [singular, plural] = RANK_UNIT_LABEL[unit]
  return `${quantidade} ${quantidade === 1 ? singular : plural}`
}

/** Cabeçalho da coluna de quantidade na exportação, ex: "Itens". */
export function rankUnitHeader(unit: RankUnit): string {
  const plural = RANK_UNIT_LABEL[unit][1]
  return plural.charAt(0).toUpperCase() + plural.slice(1)
}

function accumulate() {
  const map = new Map<string, RankRow>()
  return {
    add(key: string, label: string, quantidade: number, faturamento: number) {
      const row = map.get(key)
      if (row) {
        row.quantidade += quantidade
        row.faturamento += faturamento
      } else {
        map.set(key, { key, label, quantidade, faturamento })
      }
    },
    rows(): RankRow[] {
      return [...map.values()].sort((a, b) => b.quantidade - a.quantidade || b.faturamento - a.faturamento)
    },
  }
}

/** Ranking de itens vendidos (quantidade e faturamento), só de pedidos pagos. */
export function rankItems(orders: ReportOrder[]): RankRow[] {
  const acc = accumulate()
  for (const order of orders) {
    if (!isPaid(order)) continue
    for (const item of order.items) {
      // O produto pode ter sido apagado do cardápio depois: o nome gravado no
      // pedido é o que sobra, e é por ele que agrupamos nesse caso.
      acc.add(item.menu_item_id ?? item.nome_item, item.nome_item, item.quantidade, lineTotal(item))
    }
  }
  return acc.rows()
}

/**
 * Produtos do cardápio que não venderam nenhuma unidade no período. São os
 * candidatos reais a sair do cardápio — justamente por terem zero venda, não
 * aparecem em lugar nenhum do ranking.
 *
 * Só entram os que estão disponíveis: um produto desligado no painel não
 * vendeu porque ninguém podia comprá-lo, e listá-lo aqui seria acusar o
 * cardápio de um silêncio que a própria equipe pediu.
 */
export function unsoldItems(sold: RankRow[], menuItems: ReportMenuItem[]): ReportMenuItem[] {
  const soldIds = new Set(sold.map((row) => row.key))
  const soldNames = new Set(sold.map((row) => row.label))
  return menuItems
    .filter((item) => item.disponivel && !soldIds.has(item.id) && !soldNames.has(item.nome))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function rankCategories(
  orders: ReportOrder[],
  menuItemsById: Map<string, ReportMenuItem>,
  categoriesById: Map<string, ReportCategory>,
): RankRow[] {
  const acc = accumulate()
  for (const order of orders) {
    if (!isPaid(order)) continue
    for (const item of order.items) {
      const menuItem = item.menu_item_id ? menuItemsById.get(item.menu_item_id) : undefined
      const category = menuItem ? categoriesById.get(menuItem.categoria_id) : undefined
      acc.add(category?.id ?? '__sem_categoria', category?.nome ?? 'Sem categoria', item.quantidade, lineTotal(item))
    }
  }
  return acc.rows()
}

/**
 * Grupos de adicional que representam o tamanho da porção. O nome do grupo é
 * o sinal principal (a loja usa "Größe"/"Tamanho"), mas opções escritas em ml
 * também entram — assim um grupo renomeado não some do relatório.
 */
const SIZE_GROUP_PATTERN = /gr(ö|o|oe)sse|tamanho|size|taille|formato|volume/i
const SIZE_OPTION_PATTERN = /^\s*\d+\s*(ml|l|g)\b/i

export function isSizeOption(option: SelectedModifierOption): boolean {
  return SIZE_GROUP_PATTERN.test(option.modifier_nome) || SIZE_OPTION_PATTERN.test(option.option_nome)
}

/**
 * Adicionais mais pedidos. `faturamento` conta só o que o adicional acrescentou
 * ao preço — o `preco_unitario` do item já embute isso — que é onde costuma
 * estar a margem do açaí.
 */
export function rankModifierOptions(orders: ReportOrder[], options: { size: boolean }): RankRow[] {
  const acc = accumulate()
  for (const order of orders) {
    if (!isPaid(order)) continue
    for (const item of order.items) {
      for (const selected of item.modifiers_selecionados) {
        if (isSizeOption(selected) !== options.size) continue
        // `?? 1`: pedidos gravados antes de existir quantidade por opção
        // (ex: "3x Granola") ficam como 1 porção, o comportamento de sempre.
        const porcoes = (selected.quantidade ?? 1) * item.quantidade
        acc.add(selected.option_id || selected.option_nome, selected.option_nome, porcoes, num(selected.preco_adicional) * porcoes)
      }
    }
  }
  return acc.rows()
}

/**
 * Item montado pelo cliente ou opção pronta do cardápio. O sinal é o
 * `max_ingredientes` do produto — é ele que liga a montagem customizada. Se o
 * produto já saiu do cardápio, cai no que ficou gravado no pedido: escolheu
 * algo além do tamanho, era montado.
 */
export function isCustomItem(item: OrderItem, menuItemsById: Map<string, ReportMenuItem>): boolean {
  const menuItem = item.menu_item_id ? menuItemsById.get(item.menu_item_id) : undefined
  if (menuItem) return menuItem.max_ingredientes != null
  return item.modifiers_selecionados.some((option) => !isSizeOption(option))
}

/** Duas linhas comparáveis: montagem customizada vs opção pronta do cardápio. */
export function splitCustomVsReady(orders: ReportOrder[], menuItemsById: Map<string, ReportMenuItem>): RankRow[] {
  const acc = accumulate()
  for (const order of orders) {
    if (!isPaid(order)) continue
    for (const item of order.items) {
      const custom = isCustomItem(item, menuItemsById)
      acc.add(
        custom ? 'personalizado' : 'pronto',
        custom ? 'Montado pelo cliente' : 'Opção pronta do cardápio',
        item.quantidade,
        lineTotal(item),
      )
    }
  }
  return acc.rows()
}

/** Faturamento por forma de pagamento — como a SumUp reportou a transação no cartão, ou "Dinheiro" quando a equipe confirmou o troco no caixa. */
export function rankPaymentMethods(orders: ReportOrder[]): RankRow[] {
  const acc = accumulate()
  for (const order of orders) {
    if (!isPaid(order)) continue
    const label = order.forma_pagamento ?? 'Não informado'
    acc.add(label, label, 1, orderGross(order))
  }
  return acc.rows()
}

// =====================================================================
// Operação e tempo
// =====================================================================

export interface HourHeatmap {
  /** `[dia da semana 0=Dom][hora 0-23]` = pedidos pagos naquele encaixe. */
  cells: number[][]
  byHour: number[]
  byWeekday: number[]
  faturamentoByWeekday: number[]
  max: number
}

export function buildHourHeatmap(orders: ReportOrder[]): HourHeatmap {
  const cells = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const byHour = new Array<number>(24).fill(0)
  const byWeekday = new Array<number>(7).fill(0)
  const faturamentoByWeekday = new Array<number>(7).fill(0)
  let max = 0

  for (const order of orders) {
    if (!isPaid(order)) continue
    const date = new Date(order.criado_em)
    const weekday = date.getDay()
    const hour = date.getHours()
    const value = ++cells[weekday][hour]
    byHour[hour]++
    byWeekday[weekday]++
    faturamentoByWeekday[weekday] += orderGross(order) - num(order.gorjeta)
    if (value > max) max = value
  }

  return { cells, byHour, byWeekday, faturamentoByWeekday, max }
}

export interface FulfillmentStats {
  /** Quantos pedidos entregues tinham horário de entrega para medir. */
  amostra: number
  /** Do pagamento confirmado até a entrega — o tempo da cozinha. */
  preparoMedioSegundos: number
  preparoMedianaSegundos: number
  /** Do primeiro toque no totem até a entrega — o tempo que o cliente sente. */
  totalMedioSegundos: number
}

export function summarizeFulfillment(orders: ReportOrder[]): FulfillmentStats {
  const preparo: number[] = []
  const total: number[] = []

  for (const order of orders) {
    if (order.status !== 'entregue') continue
    // Pedidos anteriores às colunas de marco não têm `entregue_em`; o backfill
    // do schema usa `atualizado_em`, que num pedido entregue é exatamente o
    // momento em que ele foi marcado como entregue.
    const deliveredIso = order.entregue_em ?? order.atualizado_em
    if (!deliveredIso) continue
    const delivered = new Date(deliveredIso).getTime()
    const created = new Date(order.criado_em).getTime()
    const paid = order.pago_em ? new Date(order.pago_em).getTime() : created
    const prep = (delivered - paid) / 1000
    const full = (delivered - created) / 1000
    // Um acerto manual de status pode inverter os marcos e produzir tempo
    // negativo; fora da amostra, para não puxar a média para baixo.
    if (prep < 0 || full < 0) continue
    preparo.push(prep)
    total.push(full)
  }

  return {
    amostra: preparo.length,
    preparoMedioSegundos: mean(preparo),
    preparoMedianaSegundos: median(preparo),
    totalMedioSegundos: mean(total),
  }
}

function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// =====================================================================
// Tendência mensal
// =====================================================================

export interface TrendPoint {
  key: string
  label: string
  pedidos: number
  /** Faturamento sem gorjeta, para a linha do gráfico. */
  faturamento: number
}

/** Últimos `months` meses (o atual incluído), mesmo os que não venderam nada. */
export function buildMonthlyTrend(orders: TrendOrder[], months: number, now: Date = new Date()): TrendPoint[] {
  const points = new Map<string, TrendPoint>()
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(startOfMonth(now), -i)
    const key = toMonthKey(month)
    points.set(key, { key, label: shortMonthLabel(month), pedidos: 0, faturamento: 0 })
  }

  for (const order of orders) {
    if (!isPaid(order)) continue
    const point = points.get(toMonthKey(new Date(order.criado_em)))
    if (!point) continue
    point.pedidos++
    point.faturamento += num(order.valor_pago) - num(order.gorjeta)
  }

  return [...points.values()]
}

// =====================================================================
// Formatação compartilhada entre a tela e a exportação
// =====================================================================

/** "1h 12min", "8 min", "45 s" */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)} s`
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}min`
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`
}

/** "+12,4%" / "−8,0%" / "—" quando não havia período anterior para comparar. */
export function formatVariation(value: number | null): string {
  if (value === null) return '—'
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${(Math.abs(value) * 100).toFixed(1).replace('.', ',')}%`
}

// =====================================================================
// Relatório completo
// =====================================================================

/** Tudo que a tela desenha e a exportação escreve, calculado de uma vez só. */
export interface Report {
  period: Period
  previous: Period
  sales: SalesSummary
  previousSales: SalesSummary
  itens: RankRow[]
  naoVendidos: ReportMenuItem[]
  categorias: RankRow[]
  adicionais: RankRow[]
  tamanhos: RankRow[]
  montagem: RankRow[]
  formasPagamento: RankRow[]
  heatmap: HourHeatmap
  entrega: FulfillmentStats
  tendencia: TrendPoint[]
}

export interface ReportInput {
  period: Period
  orders: ReportOrder[]
  previousOrders: ReportOrder[]
  trendOrders: TrendOrder[]
  menuItems: ReportMenuItem[]
  categories: ReportCategory[]
  trendMonths: number
  now?: Date
}

export function buildReport(input: ReportInput): Report {
  const menuItemsById = new Map(input.menuItems.map((item) => [item.id, item]))
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]))
  const itens = rankItems(input.orders)

  return {
    period: input.period,
    previous: previousPeriod(input.period),
    sales: summarizeSales(input.orders),
    previousSales: summarizeSales(input.previousOrders),
    itens,
    naoVendidos: unsoldItems(itens, input.menuItems),
    categorias: rankCategories(input.orders, menuItemsById, categoriesById),
    adicionais: rankModifierOptions(input.orders, { size: false }),
    tamanhos: rankModifierOptions(input.orders, { size: true }),
    montagem: splitCustomVsReady(input.orders, menuItemsById),
    formasPagamento: rankPaymentMethods(input.orders),
    heatmap: buildHourHeatmap(input.orders),
    entrega: summarizeFulfillment(input.orders),
    tendencia: buildMonthlyTrend(input.trendOrders, input.trendMonths, input.now),
  }
}
