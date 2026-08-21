import { useMemo, useState, type ReactNode } from 'react'
import {
  ChartColumn,
  Clock,
  Coins,
  CreditCard,
  Download,
  Layers,
  Percent,
  Printer,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react'
import { formatCHF } from '@shared/format'
import { addDays, dateKeyToDate, toDateKey } from '../dateUtils'
import { TREND_MONTHS, useReports } from '../hooks/useReports'
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
import ReportHeatmap from './ReportHeatmap'
import ReportTrendChart from './ReportTrendChart'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/**
 * Relatórios do Painel da Equipe: vendas, cardápio, operação e pagamento no
 * período escolhido, sempre com a comparação contra o período anterior de
 * mesmo tamanho.
 *
 * Só pedidos pagos entram no faturamento e nos rankings. Os que ficaram no
 * caminho não somem: viram carrinho abandonado e falha de pagamento no bloco
 * de conversão, que é onde eles significam alguma coisa.
 */
export default function ReportsPanel() {
  const [preset, setPreset] = useState<PeriodPresetId>('sete_dias')
  const [customStart, setCustomStart] = useState(() => toDateKey(addDays(new Date(), -6)))
  const [customEnd, setCustomEnd] = useState(() => toDateKey(new Date()))

  const period = useMemo(
    () => resolvePeriod(preset, dateKeyToDate(customStart), dateKeyToDate(customEnd)),
    [preset, customStart, customEnd],
  )

  const { orders, previousOrders, trendOrders, menuItems, categories, loading, error, reload } = useReports(period)

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

  const { sales, previousSales, conversion, entrega, heatmap } = report

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

  const tipShare = sales.pedidos ? sales.pedidosComGorjeta / sales.pedidos : 0

  // O cardápio tem muito mais adicional grátis do que pago, e por quantidade os
  // grátis empurram os pagos para fora da lista. Como a margem está justamente
  // nos pagos, eles ganham um ranking próprio, por receita.
  const adicionaisPagos = useMemo(
    () => report.adicionais.filter((row) => row.faturamento > 0),
    [report.adicionais],
  )

  return (
    <div className="reports">
      <div className="reports__toolbar">
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
              Até
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </label>
          </div>
        )}

        <div className="reports__actions">
          <button className="reports__action" onClick={reload} disabled={loading}>
            <RefreshCw size={15} strokeWidth={2} aria-hidden />
            Atualizar
          </button>
          <button
            className="reports__action"
            onClick={() => downloadCsv(reportFilename('relatorio-resumo', report), buildSummaryCsv(report))}
          >
            <Download size={15} strokeWidth={2} aria-hidden />
            CSV resumo
          </button>
          <button
            className="reports__action"
            onClick={() => downloadCsv(reportFilename('relatorio-pedidos', report), buildOrdersCsv(orders))}
          >
            <Download size={15} strokeWidth={2} aria-hidden />
            CSV pedidos
          </button>
          <button
            className="reports__action"
            onClick={() => downloadCsv(reportFilename('relatorio-itens', report), buildItemsCsv(orders))}
          >
            <Download size={15} strokeWidth={2} aria-hidden />
            CSV itens
          </button>
          {/* PDF sai da impressão do navegador ("Salvar como PDF"), com o CSS
              de impressão escondendo a barra de ferramentas. */}
          <button className="reports__action" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={2} aria-hidden />
            PDF
          </button>
        </div>
      </div>

      <p className="reports__period">
        {periodLabel(period)} <span>· comparado com {periodLabel(report.previous)}</span>
      </p>

      {error && <p className="equipe-app__error">Erro ao carregar relatórios: {error}</p>}
      {loading && <p className="equipe-app__status">Calculando relatórios…</p>}

      {!loading && !error && (
        <>
          <Section icon={<TrendingUp size={16} strokeWidth={2} aria-hidden />} title="Vendas e faturamento">
            <div className="kpi-grid">
              <Kpi
                label="Faturamento"
                value={formatCHF(sales.faturamentoBruto)}
                delta={variation(sales.faturamentoBruto, previousSales.faturamentoBruto)}
                hint={`${formatCHF(sales.faturamentoLiquido)} sem gorjetas`}
              />
              <Kpi
                label="Pedidos pagos"
                value={String(sales.pedidos)}
                delta={variation(sales.pedidos, previousSales.pedidos)}
                hint={`${conversion.criados} iniciados no totem`}
              />
              <Kpi
                label="Ticket médio"
                value={formatCHF(sales.ticketMedio)}
                delta={variation(sales.ticketMedio, previousSales.ticketMedio)}
                hint="Faturamento sem gorjeta ÷ pedidos"
              />
              <Kpi
                label="Gorjetas"
                value={formatCHF(sales.gorjetas)}
                delta={variation(sales.gorjetas, previousSales.gorjetas)}
                hint={`${formatCHF(sales.gorjetaMedia)} por pedido · ${formatPercent(tipShare, 0)} deixaram gorjeta`}
              />
            </div>

            <h3 className="reports__subtitle">
              <ChartColumn size={15} strokeWidth={2} aria-hidden />
              Tendência dos últimos {TREND_MONTHS} meses
            </h3>
            <ReportTrendChart points={report.tendencia} />

            <h3 className="reports__subtitle">
              <CreditCard size={15} strokeWidth={2} aria-hidden />
              Faturamento por forma de pagamento
            </h3>
            <ReportBarList
              rows={report.formasPagamento}
              metric="faturamento"
              empty="Nenhum pagamento confirmado no período."
            />
          </Section>

          <Section icon={<ShoppingBag size={16} strokeWidth={2} aria-hidden />} title="Produtos e cardápio">
            <div className="reports__columns">
              <div>
                <h3 className="reports__subtitle">Mais vendidos</h3>
                <ReportBarList rows={report.itens} limit={10} />
              </div>
              <div>
                <h3 className="reports__subtitle">Menos vendidos</h3>
                <ReportBarList rows={report.itens} limit={10} fromBottom />
                {report.naoVendidos.length > 0 && (
                  <div className="reports__note">
                    <strong>Nenhuma venda no período ({report.naoVendidos.length}):</strong>{' '}
                    {report.naoVendidos.map((item) => item.nome).join(', ')}
                  </div>
                )}
              </div>
            </div>

            <h3 className="reports__subtitle">
              <Layers size={15} strokeWidth={2} aria-hidden />
              Faturamento por categoria
            </h3>
            <ReportBarList rows={report.categorias} metric="faturamento" />

            <div className="reports__columns">
              <div>
                <h3 className="reports__subtitle">Adicionais mais pedidos</h3>
                <ReportBarList rows={report.adicionais} limit={12} empty="Nenhum adicional escolhido no período." />

                <h3 className="reports__subtitle">Adicionais pagos, por receita</h3>
                <ReportBarList
                  rows={adicionaisPagos}
                  metric="faturamento"
                  empty="Nenhum adicional pago escolhido no período."
                />
                <p className="reports__caption">
                  O valor é só o que o adicional acrescentou ao preço do item, não a linha inteira.
                </p>
              </div>
              <div>
                <h3 className="reports__subtitle">Tamanhos mais pedidos</h3>
                <ReportBarList rows={report.tamanhos} empty="Nenhum tamanho registrado no período." />

                <h3 className="reports__subtitle">Montagem customizada vs opção pronta</h3>
                <ReportBarList rows={report.montagem} empty="Sem itens vendidos no período." />
              </div>
            </div>
          </Section>

          <Section icon={<Clock size={16} strokeWidth={2} aria-hidden />} title="Operação e tempo">
            <div className="kpi-grid">
              <Kpi
                label="Tempo médio de preparo"
                value={formatDuration(entrega.preparoMedioSegundos)}
                hint={`Mediana ${formatDuration(entrega.preparoMedianaSegundos)} · ${entrega.amostra} pedidos medidos`}
              />
              <Kpi
                label="Do pedido à entrega"
                value={formatDuration(entrega.totalMedioSegundos)}
                hint="Inclui o tempo que o cliente levou para pagar"
              />
              <Kpi
                label="Hora mais movimentada"
                value={busiestHourLabel(heatmap.byHour)}
                hint={`Pico de ${heatmap.max} pedido(s) numa hora`}
              />
              <Kpi
                label="Dia mais movimentado"
                value={weekdayRows[0]?.label ?? '—'}
                hint={weekdayRows[0] ? `${weekdayRows[0].quantidade} pedidos` : 'Sem pedidos no período'}
              />
            </div>

            <h3 className="reports__subtitle">Horários de pico</h3>
            <ReportHeatmap heatmap={heatmap} />

            <h3 className="reports__subtitle">Dias da semana</h3>
            <ReportBarList rows={weekdayRows} metric="quantidade" />
          </Section>

          <Section icon={<Percent size={16} strokeWidth={2} aria-hidden />} title="Pagamento e conversão">
            <div className="kpi-grid">
              <Kpi
                label="Taxa de conversão"
                value={formatPercent(conversion.taxaConversao)}
                delta={variation(conversion.taxaConversao, report.previousConversion.taxaConversao)}
                hint={`${conversion.pagos} pagos de ${conversion.criados} iniciados`}
              />
              <Kpi
                label="Carrinhos abandonados"
                value={String(conversion.abandonados)}
                hint={`${formatCHF(conversion.valorAbandonado)} que não entraram no caixa`}
              />
              <Kpi
                label="Falhas de pagamento"
                value={String(conversion.falhas)}
                hint="Pedidos cancelados porque a SumUp recusou"
              />
              <Kpi
                label="Gorjeta média"
                value={formatCHF(sales.gorjetaMedia)}
                delta={variation(sales.gorjetaMedia, previousSales.gorjetaMedia)}
                hint={`${sales.pedidosComGorjeta} pedidos deixaram gorjeta`}
              />
            </div>

            <h3 className="reports__subtitle">
              <Coins size={15} strokeWidth={2} aria-hidden />
              Comparativo com o período anterior
            </h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>{periodLabel(period)}</th>
                  <th>{periodLabel(report.previous)}</th>
                  <th>Variação</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  label="Faturamento bruto"
                  current={sales.faturamentoBruto}
                  previous={previousSales.faturamentoBruto}
                  format={formatCHF}
                />
                <ComparisonRow
                  label="Faturamento sem gorjeta"
                  current={sales.faturamentoLiquido}
                  previous={previousSales.faturamentoLiquido}
                  format={formatCHF}
                />
                <ComparisonRow
                  label="Pedidos pagos"
                  current={sales.pedidos}
                  previous={previousSales.pedidos}
                  format={(v) => String(v)}
                />
                <ComparisonRow
                  label="Ticket médio"
                  current={sales.ticketMedio}
                  previous={previousSales.ticketMedio}
                  format={formatCHF}
                />
                <ComparisonRow
                  label="Gorjetas"
                  current={sales.gorjetas}
                  previous={previousSales.gorjetas}
                  format={formatCHF}
                />
                <ComparisonRow
                  label="Taxa de conversão"
                  current={conversion.taxaConversao}
                  previous={report.previousConversion.taxaConversao}
                  format={(v) => formatPercent(v)}
                />
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="reports__section">
      <h2 className="reports__section-title">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Kpi({
  label,
  value,
  delta,
  hint,
}: {
  label: string
  value: string
  delta?: number | null
  hint?: string
}) {
  const direction = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return (
    <article className="kpi-card">
      <p className="kpi-card__label">{label}</p>
      <p className="kpi-card__value">{value}</p>
      {delta !== undefined && (
        <p className={`kpi-card__delta kpi-card__delta--${direction}`}>
          {formatVariation(delta ?? null)} <span>vs período anterior</span>
        </p>
      )}
      {hint && <p className="kpi-card__hint">{hint}</p>}
    </article>
  )
}

function ComparisonRow({
  label,
  current,
  previous,
  format,
}: {
  label: string
  current: number
  previous: number
  format: (value: number) => string
}) {
  const delta = variation(current, previous)
  const direction = delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return (
    <tr>
      <td>{label}</td>
      <td>{format(current)}</td>
      <td>{format(previous)}</td>
      <td className={`report-table__delta report-table__delta--${direction}`}>{formatVariation(delta)}</td>
    </tr>
  )
}

/** "12h–13h" da hora com mais pedidos, ou "—" quando o período está vazio. */
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
