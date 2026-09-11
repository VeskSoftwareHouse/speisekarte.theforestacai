import type { Imposto, OrderItem, ReportOrder } from '@shared/types'
import { valorUnitarioComImposto } from './estoqueCalc'
import type { ReferenceMaps } from './estoqueConsumo'
import { isPaid, lineTotal } from './reportMetrics'

/** Um item de compra já recebida — o suficiente pra entrar no custo médio. */
export interface ItemCompraRecebida {
  insumo_id: string
  quantidade: number
  valor_unitario: number | null
}

/**
 * Custo médio ponderado por insumo, a partir das compras já recebidas — com
 * o imposto vinculado de HOJE aplicado (nunca o de quando a compra foi
 * lançada), mesmo espírito de `insumo_saldos`/`valorUnitarioComImposto`: a
 * fonte da verdade é sempre o cadastro atual, nunca um valor congelado no
 * passado. Um insumo nunca comprado fica de fora do mapa — custo
 * desconhecido é diferente de custo zero, e tratar os dois igual inflaria a
 * margem de qualquer produto que use esse insumo.
 */
export function custoMedioPorInsumo(itens: ItemCompraRecebida[], impostos: Imposto[]): Map<string, number> {
  const soma = new Map<string, { valor: number; quantidade: number }>()
  for (const item of itens) {
    if (item.valor_unitario == null || item.quantidade <= 0) continue
    const custoComImposto = valorUnitarioComImposto(item.valor_unitario, item.insumo_id, impostos)
    const acc = soma.get(item.insumo_id) ?? { valor: 0, quantidade: 0 }
    acc.valor += custoComImposto * item.quantidade
    acc.quantidade += item.quantidade
    soma.set(item.insumo_id, acc)
  }
  const custos = new Map<string, number>()
  for (const [insumoId, { valor, quantidade }] of soma) custos.set(insumoId, valor / quantidade)
  return custos
}

interface CustoItem {
  custo: number
  /** false quando algum insumo usado (composição ou adicional vinculado) não
   * tem custo conhecido ainda — o custo devolvido é uma SUBESTIMATIVA, não a
   * conta completa. */
  completo: boolean
}

/** Custo de UM item vendido — composição do produto + adicionais vinculados
 * a insumo — já multiplicado pela quantidade do item. */
function custoDoItem(item: OrderItem, maps: ReferenceMaps, custoPorInsumo: Map<string, number>): CustoItem {
  let custoUnitario = 0
  let completo = true

  if (item.menu_item_id) {
    const composicao = maps.composicaoPorItem.get(item.menu_item_id)
    if (!composicao || composicao.length === 0) {
      completo = false
    } else {
      for (const linha of composicao) {
        const custo = custoPorInsumo.get(linha.insumo_id)
        if (custo == null) {
          completo = false
          continue
        }
        custoUnitario += custo * linha.quantidade
      }
    }
  } else {
    // Produto apagado do cardápio — só sobrou o nome gravado no pedido, sem
    // como saber que composição ele tinha.
    completo = false
  }

  // Adicional sem insumo vinculado não é "custo desconhecido": é um adicional
  // que de propósito não desconta estoque (ex: "sem açúcar"). Só entra no
  // cálculo quando tem vínculo.
  for (const mod of item.modifiers_selecionados) {
    const opcao = maps.optionById.get(mod.option_id)
    if (!opcao?.insumo_id || !opcao.quantidade_padrao) continue
    const custo = custoPorInsumo.get(opcao.insumo_id)
    if (custo == null) {
      completo = false
      continue
    }
    custoUnitario += custo * opcao.quantidade_padrao
  }

  return { custo: custoUnitario * item.quantidade, completo }
}

export interface MarginRow {
  key: string
  label: string
  quantidade: number
  receita: number
  custo: number
  /** false quando algum item somado aqui teve custo incompleto — o custo
   * mostrado é uma subestimativa, e a margem não deve ser mostrada como um
   * número exato. */
  custoCompleto: boolean
}

export interface GrossProfitSummary {
  /** Faturamento sem gorjeta — a gorjeta não é receita do produto. */
  receitaLiquida: number
  /** Custo só da parte da receita com custo 100% conhecido (ver coberturaCusto). */
  custoTotal: number
  /** receita (só a parte com custo conhecido) − custoTotal. */
  lucroBruto: number
  /** Fração da receita líquida cujo custo é conhecido por completo — o resto
   * (produtosSemCusto) fica de fora da conta acima, pra não fingir precisão
   * que não existe. */
  coberturaCusto: number
  produtosSemCusto: string[]
}

export interface MarginReport {
  linhas: MarginRow[]
  resumo: GrossProfitSummary
}

/**
 * Margem por produto e lucro bruto do período, a partir da composição/vínculo
 * ATUAIS (a configuração de agora, não a de quando cada pedido foi feito —
 * mesmo espírito do Fechamento) e do custo médio pago nas compras já
 * recebidas. Só pedidos pagos entram, mesmo filtro do resto dos relatórios.
 */
export function buildMarginReport(
  orders: ReportOrder[],
  maps: ReferenceMaps,
  custoPorInsumo: Map<string, number>,
): MarginReport {
  const acc = new Map<string, MarginRow>()
  let receitaLiquida = 0
  let receitaSemCustoCompleto = 0
  let custoConhecido = 0
  const produtosSemCusto = new Set<string>()

  for (const order of orders) {
    if (!isPaid(order)) continue
    for (const item of order.items) {
      const receita = lineTotal(item)
      const { custo, completo } = custoDoItem(item, maps, custoPorInsumo)

      receitaLiquida += receita
      if (completo) custoConhecido += custo
      else {
        receitaSemCustoCompleto += receita
        produtosSemCusto.add(item.nome_item)
      }

      const key = item.menu_item_id ?? item.nome_item
      const row = acc.get(key) ?? {
        key,
        label: item.nome_item,
        quantidade: 0,
        receita: 0,
        custo: 0,
        custoCompleto: true,
      }
      row.quantidade += item.quantidade
      row.receita += receita
      row.custo += custo
      if (!completo) row.custoCompleto = false
      acc.set(key, row)
    }
  }

  const receitaComCustoCompleto = receitaLiquida - receitaSemCustoCompleto

  return {
    linhas: [...acc.values()].sort((a, b) => b.receita - a.receita),
    resumo: {
      receitaLiquida,
      custoTotal: custoConhecido,
      lucroBruto: receitaComCustoCompleto - custoConhecido,
      coberturaCusto: receitaLiquida > 0 ? receitaComCustoCompleto / receitaLiquida : 0,
      produtosSemCusto: [...produtosSemCusto].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    },
  }
}
