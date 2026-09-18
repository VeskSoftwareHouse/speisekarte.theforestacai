import { useMemo, useState, type ReactNode } from 'react'
import { Download, Printer, RefreshCw } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { addDays, dateKeyToDate, toDateKey } from '../dateUtils'
import { TREND_MONTHS, useReports } from '../hooks/useReports'
import { buildMarginReport } from '../lucroCalc'
import {
  buildReport,
  formatDuration,
  formatPercent,
  formatVariation,
  periodLabel,
  resolvePeriod,
  variation,
  PERIOD_PRESETS,
  type PeriodPresetId,
  type RankRow,
} from '../reportMetrics'
import { buildItemsCsv, buildOrdersCsv, buildSummaryCsv, downloadCsv, reportFilename } from '../reportExport'
import ReportBarList from './ReportBarList'
import ReportMarginList from './ReportMarginList'
import ReportHeatmap from './ReportHeatmap'
import ReportTrendChart from './ReportTrendChart'
import { TooltipProvider, useTooltipBody } from './ReportTooltip'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Quantos produtos entram em "o que mais sai" — o resto é candidato a encalhe. */
const TOP_ITENS = 6

/**
 * Relatórios do Painel da Equipe.
 *
 * A tela se lê de cima para baixo como uma resposta que vai ficando mais
 * específica: primeiro quanto entrou no período, depois de onde esse dinheiro
 * veio, e só então quando a loja encheu. Cada bloco diz por extenso a pergunta
 * que responde — quem abre isto está no balcão, não numa reunião de diretoria.
 *
 * Só pedidos pagos entram no faturamento e nos rankings. Os que ficaram no
 * caminho não somem: aparecem como desistência e cartão recusado, que é onde
 * eles significam alguma coisa.
 */
export default function ReportsPanel() {
  return (
    <TooltipProvider>
      <ReportsBody />
    </TooltipProvider>
  )
}

function ReportsBody() {
  const [preset, setPreset] = useState<PeriodPresetId>('sete_dias')
  const [customStart, setCustomStart] = useState(() => toDateKey(addDays(new Date(), -6)))
  const [customEnd, setCustomEnd] = useState(() => toDateKey(new Date()))

  const period = useMemo(
    () => resolvePeriod(preset, dateKeyToDate(customStart), dateKeyToDate(customEnd)),
    [preset, customStart, customEnd],
  )

  const { orders, previousOrders, trendOrders, menuItems, categories, maps, custoPorInsumo, insumoById, loading, error, reload } =
    useReports(period)

  const report = useMemo(
    () =>
      buildReport({
        period,
        orders,
        previousOrders,
        trendOrders,
        menuItems,
        categories,
        trendMonths: TREND_MONTHS,
      }),
    [period, orders, previousOrders, trendOrders, menuItems, categories],
  )

  const margin = useMemo(() => buildMarginReport(orders, maps, custoPorInsumo), [orders, maps, custoPorInsumo])

  const { sales, previousSales, entrega, heatmap } = report

  const weekdayRows: RankRow[] = useMemo(
    () =>
      WEEKDAYS.map((label, weekday) => ({
        key: String(weekday),
        label,
        quantidade: heatmap.byWeekday[weekday],
        faturamento: heatmap.faturamentoByWeekday[weekday],
      }))
        .filter((row) => row.quantidade > 0)
        .sort((a, b) => b.quantidade - a.quantidade),
    [heatmap],
  )

  // O cardápio tem muito mais adicional grátis do que pago, e por quantidade os
  // grátis empurram os pagos para fora da lista. Como a margem está justamente
  // nos pagos, eles ganham um ranking próprio, por receita.
  const adicionaisPagos = useMemo(() => report.adicionais.filter((row) => row.faturamento > 0), [report.adicionais])

  /**
   * Uma lista só para a pergunta "o que tirar do cardápio": quem não vendeu
   * nada primeiro, depois quem vendeu pouco. Antes eram duas — a cauda do
   * ranking e, num quadro à parte, os produtos com zero venda, que são
   * justamente os candidatos mais óbvios.
   */
  const encalhados: RankRow[] = useMemo(() => {
    // Os campeões saem daqui: com poucos produtos vendidos, as duas listas se
    // encontrariam no meio e o mesmo item apareceria como campeão e encalhado.
    const campeoes = new Set(report.itens.slice(0, TOP_ITENS).map((row) => row.key))
    return [
      ...report.naoVendidos.map((item) => ({ key: item.id, label: item.nome, quantidade: 0, faturamento: 0 })),
      ...report.itens.filter((row) => !campeoes.has(row.key)),
    ]
  }, [report.naoVendidos, report.itens])

  const receitaAdicionais = adicionaisPagos.reduce((sum, row) => sum + row.faturamento, 0)

  const tipShare = sales.pedidos ? sales.pedidosComGorjeta / sales.pedidos : 0

  // Quantos dias o período cobre, para dizer o movimento por dia — que num
  // intervalo longo diz mais do que o total bruto de pedidos.
  const dias = Math.max(1, Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000))
  const pedidosPorDia = (sales.pedidos / dias).toFixed(1).replace('.', ',')

  return (
    <div className="reports">
      <div className="reports__bar">
        <div className="reports__presets">
          {PERIOD_PRESETS.map((option) => (
            <button
              key={option.id}
              className={`reports__preset ${preset === option.id ? 'reports__preset--active' : ''}`}
              onClick={() => setPreset(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="reports__custom">
            <label>
              De
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </label>
            <label>
              até
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </label>
          </div>
        )}

        <div className="reports__tools">
          {/* <details> em vez de um menu em JavaScript: três botões de download
              soltos na barra pesavam mais na tela do que valiam. */}
          <details className="reports__menu">
            <summary>
              <Download size={15} strokeWidth={2} aria-hidden />
              Exportar
            </summary>
            <div className="reports__menu-list">
              <button onClick={() => downloadCsv(reportFilename('relatorio-resumo', report), buildSummaryCsv(report))}>
                Resumo do período
                <small>Todos os números desta tela</small>
              </button>
              <button onClick={() => downloadCsv(reportFilename('relatorio-pedidos', report), buildOrdersCsv(orders))}>
                Um pedido por linha
                <small>Para conciliar com o extrato da SumUp</small>
              </button>
              <button onClick={() => downloadCsv(reportFilename('relatorio-itens', report), buildItemsCsv(orders))}>
                Um item por linha
                <small>Para conferir margem produto a produto</small>
              </button>
            </div>
          </details>

          <button className="reports__tool" onClick={() => window.print()} title="Imprimir ou salvar em PDF">
            <Printer size={15} strokeWidth={2} aria-hidden />
            PDF
          </button>
          <button className="reports__tool" onClick={reload} disabled={loading} title="Recarregar os dados">
            <RefreshCw size={15} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {error && <p className="equipe-app__error">Erro ao carregar relatórios: {error}</p>}
      {loading && <p className="equipe-app__status">Calculando relatórios…</p>}

      {!loading && !error && (
        <>
          <header className="reports__hero">
            <h2 className="reports__hero-period">{periodLabel(period)}</h2>
            <p className="reports__hero-sub">Comparado com {periodLabel(report.previous)}</p>
          </header>

          <Section title="Vendas" hint="Só pedidos pagos: quanto entrou, quanto era gorjeta e quanto rendeu cada um.">
            <div className="stat-strip">
              <Stat
                label="Pedidos pagos"
                value={String(sales.pedidos)}
                delta={variation(sales.pedidos, previousSales.pedidos)}
                hint={dias > 1 ? `Média de ${pedidosPorDia} por dia` : 'Pagos e confirmados pela SumUp'}
                detail={[
                  dias > 1 && `${sales.pedidos} pedidos em ${dias} dias`,
                  `Período anterior: ${previousSales.pedidos} pedidos pagos`,
                ]}
              />
              <Stat
                label="Entrou no caixa"
                value={formatCHF(sales.faturamentoBruto)}
                delta={variation(sales.faturamentoBruto, previousSales.faturamentoBruto)}
                hint={`${formatCHF(sales.faturamentoLiquido)} sem as gorjetas — é o que vai para a contabilidade`}
                detail={[
                  `${formatCHF(sales.faturamentoLiquido)} em produtos`,
                  `${formatCHF(sales.gorjetas)} em gorjetas`,
                  `Período anterior: ${formatCHF(previousSales.faturamentoBruto)}`,
                ]}
              />
              <Stat
                label="Gorjetas"
                value={formatCHF(sales.gorjetas)}
                delta={variation(sales.gorjetas, previousSales.gorjetas)}
                hint={`${formatPercent(tipShare, 0)} dos pedidos deixaram algo`}
                detail={[
                  `${sales.pedidosComGorjeta} de ${sales.pedidos} pedidos deixaram gorjeta`,
                  `${formatCHF(sales.gorjetaMedia)} por pedido, na média de todos`,
                  `Período anterior: ${formatCHF(previousSales.gorjetas)}`,
                ]}
              />
              <Stat
                label="Ticket médio"
                value={formatCHF(sales.ticketMedio)}
                delta={variation(sales.ticketMedio, previousSales.ticketMedio)}
                hint="Vendas sem gorjeta dividido pelos pedidos pagos"
                detail={[
                  `${formatCHF(sales.faturamentoLiquido)} ÷ ${sales.pedidos} pedidos`,
                  'A gorjeta fica de fora: ela não é venda',
                  `Período anterior: ${formatCHF(previousSales.ticketMedio)}`,
                ]}
              />
            </div>

            <Block
              title="Margem por produto"
              hint="Receita menos o custo dos insumos, pela composição e pelos preços de compra atuais"
            >
              <div className="stat-strip stat-strip--pair">
                <Stat
                  label="Lucro bruto do período"
                  value={formatCHF(margin.resumo.lucroBruto)}
                  hint="Só o custo dos ingredientes — aluguel, taxas e outras despesas fixas não entram aqui"
                  detail={[
                    `${formatCHF(margin.resumo.receitaLiquida)} de receita sem gorjeta`,
                    `${formatCHF(margin.resumo.custoTotal)} de custo de insumos, na parte com custo conhecido`,
                    margin.resumo.produtosSemCusto.length > 0 &&
                      `Fora da conta: ${margin.resumo.produtosSemCusto.join(', ')} (sem custo cadastrado ainda)`,
                  ]}
                />
                <Stat
                  label="Cobertura de custo"
                  value={formatPercent(margin.resumo.coberturaCusto, 0)}
                  hint="Fração da receita cujo custo é conhecido por completo"
                  detail={
                    margin.resumo.produtosSemCusto.length > 0
                      ? [
                          'Falta custo cadastrado (composição ou compra de algum insumo) em:',
                          margin.resumo.produtosSemCusto.join(', '),
                        ]
                      : ['Todo produto vendido no período tem composição e custo de insumo cadastrados.']
                  }
                />
              </div>
              <ReportMarginList rows={margin.linhas} insumoById={insumoById} empty="Sem vendas no período." />
            </Block>

            <Block title="Faturamento mês a mês" hint={`Últimos ${TREND_MONTHS} meses, sem gorjeta`}>
              <ReportTrendChart points={report.tendencia} />
            </Block>
          </Section>

          <Section title="Cardápio" hint="O que sai, o que encalha.">
            <div className="reports__pair">
              <Block title="O que mais sai" hint="Por unidades vendidas — um pedido pode levar vários itens">
                <ReportBarList rows={report.itens} limit={TOP_ITENS} />
              </Block>
              <Block title="O que está encalhando" hint="Candidatos a sair do cardápio ou a entrar em promoção">
                {/* Os que não venderam nada abrem a lista, com a barra zerada e
                    "nenhuma venda" escrito — antes viviam num quadro à parte,
                    embaixo, sendo eles os candidatos mais óbvios de todos. */}
                <ReportBarList
                  rows={encalhados}
                  reference={report.itens}
                  limit={TOP_ITENS}
                  tone="low"
                  order="asc"
                  empty="Todo produto disponível vendeu no período."
                />
              </Block>
            </div>

            <div className="reports__pair">
              <Block title="Adicionais mais escolhidos" hint="Quantas vezes cada um entrou num pedido">
                <ReportBarList
                  rows={report.adicionais}
                  unit="vezes"
                  limit={8}
                  empty="Nenhum adicional escolhido no período."
                />
              </Block>
              <Block
                title="Adicionais que dão margem"
                hint={`${formatCHF(receitaAdicionais)} no período — só o que o adicional acrescentou ao preço`}
              >
                <ReportBarList
                  rows={adicionaisPagos}
                  metric="faturamento"
                  unit="vezes"
                  empty="Nenhum adicional pago escolhido no período."
                />
              </Block>
            </div>

            <div className="reports__pair">
              <Block title="Tamanhos" hint="Só os sucos têm escolha de tamanho no cardápio">
                <ReportBarList rows={report.tamanhos} empty="Nenhum tamanho registrado no período." />
              </Block>
              <Block title="Vale manter a montagem customizada?" hint="Itens montados pelo cliente contra opções prontas">
                <ReportBarList rows={report.montagem} empty="Sem itens vendidos no período." />
              </Block>
            </div>
          </Section>

          <Section title="Movimento" hint="Quando a loja enche e quanto a cozinha demora.">
            <div className="stat-strip">
              <Stat
                label="Do pagamento à entrega"
                value={formatDuration(entrega.preparoMedioSegundos)}
                hint={`Metade dos pedidos sai em até ${formatDuration(entrega.preparoMedianaSegundos)}`}
                detail={[
                  'Do pagamento confirmado até a equipe marcar como entregue',
                  `Média de ${formatDuration(entrega.preparoMedioSegundos)}, mediana de ${formatDuration(
                    entrega.preparoMedianaSegundos,
                  )}`,
                  `Só entram os ${entrega.amostra} pedidos já entregues`,
                ]}
              />
              <Stat
                label="Do totem à entrega"
                value={formatDuration(entrega.totalMedioSegundos)}
                hint={`Média de ${entrega.amostra} pedidos entregues`}
                detail={[
                  'Do primeiro toque no totem até a entrega',
                  `${formatDuration(
                    entrega.totalMedioSegundos - entrega.preparoMedioSegundos,
                  )} disso é o cliente montando o pedido e pagando`,
                ]}
              />
              <Stat
                label="Hora mais cheia"
                value={busiestHourLabel(heatmap.byHour)}
                hint={`Pico de ${heatmap.max} pedidos numa hora só`}
                detail={[
                  `${Math.max(...heatmap.byHour)} pedidos nessa faixa, somando todos os dias do período`,
                  `O dia mais cheio nessa hora teve ${heatmap.max}`,
                  'O mapa de calor abaixo abre isso dia a dia',
                ]}
              />
              <Stat
                label="Dia mais cheio"
                value={weekdayRows[0]?.label ?? '—'}
                hint={weekdayRows[0] ? `${weekdayRows[0].quantidade} pedidos no período` : 'Sem pedidos no período'}
                detail={
                  weekdayRows[0]
                    ? [
                        `${weekdayRows[0].quantidade} pedidos`,
                        `${formatCHF(weekdayRows[0].faturamento)} sem gorjeta`,
                        weekdayRows[1] && `Depois vem ${weekdayRows[1].label}, com ${weekdayRows[1].quantidade}`,
                      ]
                    : ['Nenhum pedido pago no período']
                }
              />
            </div>

            <Block title="Horários de pico">
              <ReportHeatmap heatmap={heatmap} />
            </Block>

            <Block title="Dias da semana">
              <ReportBarList rows={weekdayRows} unit="pedidos" />
            </Block>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="reports__section">
      <div className="reports__section-head">
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
      {children}
    </section>
  )
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="report-block">
      <h3 className="report-block__title">
        {title}
        {hint && <span>{hint}</span>}
      </h3>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  delta,
  hint,
  detail,
}: {
  label: string
  value: string
  delta?: number | null
  hint?: string
  /** Linhas do balão de detalhe. O indicador continua legível sem elas. */
  detail?: (string | false | undefined)[]
}) {
  const tooltip = useTooltipBody()
  return (
    <div className="stat" {...(detail ? tooltip(label, detail.map((line) => line ?? false)) : {})}>
      <p className="stat__label">{label}</p>
      <p className="stat__value">
        {value}
        {delta !== undefined && <Delta value={delta} small />}
      </p>
      {hint && <p className="stat__hint">{hint}</p>}
    </div>
  )
}

/**
 * Seta com a variação. Some quando não havia período anterior para comparar.
 * `text` troca o rótulo sem mexer no sinal, que é como as taxas mostram a
 * diferença em pontos percentuais em vez de variação relativa.
 */
function Delta({ value, text, small = false }: { value: number | null; text?: string; small?: boolean }) {
  if (value === null) return null
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '='
  return (
    <span className={`delta delta--${direction} ${small ? 'delta--small' : ''}`}>
      {arrow} {text ?? formatVariation(value).replace(/^[+−]/, '')}
    </span>
  )
}

/** "16h–17h" da hora com mais pedidos, ou "—" quando o período está vazio. */
function busiestHourLabel(byHour: number[]): string {
  let best = -1
  let bestCount = 0
  byHour.forEach((count, hour) => {
    if (count > bestCount) {
      bestCount = count
      best = hour
    }
  })
  if (best < 0) return '—'
  return `${String(best).padStart(2, '0')}h–${String((best + 1) % 24).padStart(2, '0')}h`
}
