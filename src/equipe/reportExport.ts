import type { ReportOrder } from '@shared/types'
import { toDateKey } from './dateUtils'
import {
  formatDuration,
  isPaid,
  lineTotal,
  orderGross,
  rankUnitHeader,
  type RankRow,
  type RankUnit,
  type Report,
} from './reportMetrics'

/**
 * Exportação dos relatórios para a contabilidade.
 *
 * O separador é ponto e vírgula e o arquivo leva BOM porque o destino real é
 * o Excel em português: com vírgula decimal e sem BOM ele junta tudo numa
 * coluna só e come os acentos. O PDF não é gerado aqui — a tela usa a
 * impressão do próprio navegador ("Salvar como PDF"), que evita carregar uma
 * biblioteca inteira para algo que o sistema já faz.
 */

const SEPARATOR = ';'
const BOM = '﻿'

/** Número no formato que o Excel em português entende: "1234,50". */
function decimal(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/**
 * Um campo entre aspas sempre que contiver separador, aspas ou quebra de
 * linha — nomes de produto com ponto e vírgula existem e quebrariam a planilha.
 */
function cell(value: string | number): string {
  const text = String(value)
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function line(values: (string | number)[]): string {
  return values.map(cell).join(SEPARATOR)
}

/**
 * Um bloco de ranking. `unit` nomeia a coluna de quantidade: contar itens,
 * pedidos ou vezes são coisas diferentes, e um "Quantidade" genérico deixava
 * quem abre a planilha somando o que não se soma.
 */
function rankSection(title: string, rows: RankRow[], columnLabel: string, unit: RankUnit): string[] {
  if (!rows.length) return [title, 'Sem dados no período', '']
  return [
    title,
    line([columnLabel, rankUnitHeader(unit), 'Faturamento (CHF)']),
    ...rows.map((row) => line([row.label, row.quantidade, decimal(row.faturamento)])),
    '',
  ]
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Planilha de resumo: um bloco por seção do relatório, na mesma ordem da tela. */
export function buildSummaryCsv(report: Report): string {
  const { sales, previousSales, entrega, heatmap } = report

  const rows: string[] = [
    'Relatório Forest Açaí',
    line(['Período', `${toDateKey(report.period.start)} a ${toDateKey(report.period.end)}`]),
    line(['Comparado com', `${toDateKey(report.previous.start)} a ${toDateKey(report.previous.end)}`]),
    line(['Gerado em', new Date().toLocaleString('pt-BR')]),
    '',

    'Vendas e faturamento',
    line(['Métrica', 'Período', 'Período anterior']),
    line(['Pedidos pagos', sales.pedidos, previousSales.pedidos]),
    line(['Faturamento bruto (CHF)', decimal(sales.faturamentoBruto), decimal(previousSales.faturamentoBruto)]),
    line(['Gorjetas (CHF)', decimal(sales.gorjetas), decimal(previousSales.gorjetas)]),
    line(['Faturamento líquido (CHF)', decimal(sales.faturamentoLiquido), decimal(previousSales.faturamentoLiquido)]),
    line(['Ticket médio (CHF)', decimal(sales.ticketMedio), decimal(previousSales.ticketMedio)]),
    line(['Gorjeta média (CHF)', decimal(sales.gorjetaMedia), decimal(previousSales.gorjetaMedia)]),
    line(['Pedidos com gorjeta', sales.pedidosComGorjeta, previousSales.pedidosComGorjeta]),
    '',

    'Operação',
    line(['Pedidos entregues medidos', entrega.amostra]),
    line(['Tempo médio de preparo', formatDuration(entrega.preparoMedioSegundos)]),
    line(['Tempo mediano de preparo', formatDuration(entrega.preparoMedianaSegundos)]),
    line(['Tempo médio total (pedido até entrega)', formatDuration(entrega.totalMedioSegundos)]),
    '',
  ]

  rows.push(...rankSection('Itens mais vendidos', report.itens, 'Item', 'itens'))

  if (report.naoVendidos.length) {
    rows.push(
      'Produtos sem nenhuma venda no período',
      line(['Item']),
      ...report.naoVendidos.map((item) => line([item.nome])),
      '',
    )
  }

  const categoriasPorFaturamento = [...report.categorias].sort((a, b) => b.faturamento - a.faturamento)
  rows.push(...rankSection('Faturamento por categoria', categoriasPorFaturamento, 'Categoria', 'itens'))
  rows.push(...rankSection('Adicionais mais pedidos', report.adicionais, 'Adicional', 'vezes'))
  rows.push(...rankSection('Tamanhos mais pedidos', report.tamanhos, 'Tamanho', 'itens'))
  rows.push(...rankSection('Montagem customizada vs opção pronta', report.montagem, 'Tipo', 'itens'))
  const pagamentosPorFaturamento = [...report.formasPagamento].sort((a, b) => b.faturamento - a.faturamento)
  rows.push(
    ...rankSection('Faturamento por forma de pagamento', pagamentosPorFaturamento, 'Forma de pagamento', 'pedidos'),
  )

  rows.push('Movimento por dia da semana', line(['Dia', 'Pedidos', 'Faturamento (CHF)']))
  for (let weekday = 0; weekday < 7; weekday++) {
    rows.push(line([WEEKDAYS[weekday], heatmap.byWeekday[weekday], decimal(heatmap.faturamentoByWeekday[weekday])]))
  }
  rows.push('')

  rows.push('Movimento por hora do dia', line(['Hora', 'Pedidos']))
  for (let hour = 0; hour < 24; hour++) {
    if (heatmap.byHour[hour] > 0) rows.push(line([`${String(hour).padStart(2, '0')}:00`, heatmap.byHour[hour]]))
  }
  rows.push('')

  rows.push('Tendência mensal', line(['Mês', 'Pedidos', 'Faturamento líquido (CHF)']))
  for (const point of report.tendencia) {
    rows.push(line([point.key, point.pedidos, decimal(point.faturamento)]))
  }

  return BOM + rows.join('\r\n')
}

/**
 * Planilha detalhada: uma linha por pedido pago, com os itens resumidos numa
 * coluna. É a que a contabilidade concilia contra o extrato da SumUp, e lá só
 * existe o que foi cobrado — carrinho abandonado e cartão recusado não têm
 * transação do outro lado para bater.
 */
export function buildOrdersCsv(allOrders: ReportOrder[]): string {
  const orders = allOrders.filter(isPaid)
  const header = line([
    'Pedido',
    'Data',
    'Hora',
    'Status',
    'Cliente',
    'Itens',
    'Subtotal (CHF)',
    'Gorjeta (CHF)',
    'Total (CHF)',
    'Forma de pagamento',
    'Pago em',
    'Entregue em',
    'Tempo de preparo',
  ])

  const rows = orders.map((order) => {
    const created = new Date(order.criado_em)
    const total = orderGross(order)
    const gorjeta = Number(order.gorjeta ?? 0)
    const itens = order.items
      .map((item) => `${item.quantidade}x ${item.nome_item}`)
      .join(' | ')

    const paidAt = order.pago_em ? new Date(order.pago_em) : null
    const deliveredAt = order.entregue_em ? new Date(order.entregue_em) : null
    const prepSeconds =
      paidAt && deliveredAt ? (deliveredAt.getTime() - paidAt.getTime()) / 1000 : Number.NaN

    return line([
      order.id,
      created.toLocaleDateString('pt-BR'),
      created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      order.status,
      order.nome_cliente ?? '',
      itens,
      decimal(total - gorjeta),
      decimal(gorjeta),
      decimal(total),
      order.forma_pagamento ?? 'Não informado',
      paidAt ? paidAt.toLocaleString('pt-BR') : '',
      deliveredAt ? deliveredAt.toLocaleString('pt-BR') : '',
      Number.isFinite(prepSeconds) ? formatDuration(prepSeconds) : '',
    ])
  })

  return BOM + [header, ...rows].join('\r\n')
}

/** Planilha com uma linha por item vendido — a base para conferir margem. */
export function buildItemsCsv(allOrders: ReportOrder[]): string {
  const orders = allOrders.filter(isPaid)
  const header = line([
    'Pedido',
    'Data',
    'Item',
    'Quantidade',
    'Preço unitário (CHF)',
    'Total da linha (CHF)',
    'Adicionais',
    'Observações',
  ])

  const rows: string[] = []
  for (const order of orders) {
    const created = new Date(order.criado_em)
    for (const item of order.items) {
      rows.push(
        line([
          order.id,
          created.toLocaleDateString('pt-BR'),
          item.nome_item,
          item.quantidade,
          decimal(Number(item.preco_unitario ?? 0)),
          decimal(lineTotal(item)),
          item.modifiers_selecionados.map((option) => option.option_nome).join(' | '),
          item.observacoes ?? '',
        ]),
      )
    }
  }

  return BOM + [header, ...rows].join('\r\n')
}

export function reportFilename(prefix: string, report: Report): string {
  return `${prefix}-${toDateKey(report.period.start)}_a_${toDateKey(report.period.end)}.csv`
}

/** Entrega o arquivo ao navegador. Revoga a URL logo depois para não vazar o blob. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
