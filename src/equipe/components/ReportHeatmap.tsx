import type { CSSProperties } from 'react'

import { formatCHF } from '@shared/format'
import { formatPercent, type HourHeatmap } from '../reportMetrics'
import { useTooltipBody } from './ReportTooltip'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

interface Props {
  heatmap: HourHeatmap
}

/**
 * Mapa de calor de pedidos por hora e dia da semana.
 *
 * Só as horas em que a loja de fato vendeu entram no eixo: um dia inteiro de
 * 0h às 23h espremeria a faixa do movimento em um quarto da largura. E as
 * células não trazem número — 77 números pequenos brigando entre si escondem
 * exatamente o que o mapa existe para mostrar, que é onde está o escuro. O
 * número aparece no balão, junto com o peso daquela hora no período.
 */
export default function ReportHeatmap({ heatmap }: Props) {
  const tooltip = useTooltipBody()
  const activeHours = heatmap.byHour.flatMap((count, hour) => (count > 0 ? [hour] : []))

  if (!activeHours.length) {
    return <p className="report-empty">Nenhum pedido pago no período.</p>
  }

  const firstHour = Math.min(...activeHours)
  const lastHour = Math.max(...activeHours)
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i)
  const total = heatmap.byWeekday.reduce((sum, count) => sum + count, 0)

  return (
    <div className="report-heatmap">
      <div className="report-heatmap__grid" style={{ gridTemplateColumns: `auto repeat(${hours.length}, 1fr)` }}>
        <span />
        {hours.map((hour) => (
          <span
            key={hour}
            className="report-heatmap__hour"
            {...tooltip(`${String(hour).padStart(2, '0')}h às ${String((hour + 1) % 24).padStart(2, '0')}h`, [
              `${heatmap.byHour[hour]} pedidos somando todos os dias`,
              total > 0 && `${formatPercent(heatmap.byHour[hour] / total, 0)} do movimento do período`,
            ])}
          >
            {String(hour).padStart(2, '0')}
          </span>
        ))}

        {WEEKDAYS.map((label, weekday) => (
          <Row
            key={label}
            weekday={weekday}
            label={label}
            counts={heatmap.cells[weekday]}
            hours={hours}
            max={heatmap.max}
            total={total}
            weekdayTotal={heatmap.byWeekday[weekday]}
            weekdayRevenue={heatmap.faturamentoByWeekday[weekday]}
          />
        ))}
      </div>

      <p className="report-heatmap__legend">
        Cada quadrado é uma hora de um dia da semana. Quanto mais escuro, mais pedidos — o mais cheio teve{' '}
        <strong>{heatmap.max}</strong>. Passe o mouse para ver hora a hora.
      </p>
    </div>
  )
}

interface RowProps {
  weekday: number
  label: string
  counts: number[]
  hours: number[]
  max: number
  total: number
  weekdayTotal: number
  weekdayRevenue: number
}

function Row({ weekday, label, counts, hours, max, total, weekdayTotal, weekdayRevenue }: RowProps) {
  const tooltip = useTooltipBody()

  return (
    <>
      <span
        className="report-heatmap__weekday"
        {...tooltip(WEEKDAYS_FULL[weekday], [
          `${weekdayTotal} pedidos no período`,
          total > 0 && `${formatPercent(weekdayTotal / total, 0)} do movimento`,
          weekdayRevenue > 0 && `${formatCHF(weekdayRevenue)} sem gorjeta`,
        ])}
      >
        {label}
      </span>
      {hours.map((hour) => {
        const count = counts[hour]
        // A intensidade parte de 0,14 para que uma célula com 1 pedido ainda
        // se distinga do fundo; zerada, ela viraria "sem dado".
        const heat = max > 0 && count > 0 ? 0.14 + (count / max) * 0.86 : 0
        const faixa = `${String(hour).padStart(2, '0')}h às ${String((hour + 1) % 24).padStart(2, '0')}h`
        return (
          <span
            key={hour}
            className={`report-heatmap__cell ${count > 0 ? 'report-heatmap__cell--on' : ''}`}
            style={{ '--heat': heat } as CSSProperties}
            aria-label={`${WEEKDAYS_FULL[weekday]}, ${faixa}: ${count} pedidos`}
            {...tooltip(`${WEEKDAYS_FULL[weekday]}, ${faixa}`, [
              count === 0 ? 'Nenhum pedido nesta hora' : `${count} ${count === 1 ? 'pedido' : 'pedidos'}`,
              count > 0 && count === max && 'É a hora mais cheia do período',
              count > 0 && total > 0 && `${formatPercent(count / total, 0)} do movimento do período`,
            ])}
          />
        )
      })}
    </>
  )
}
