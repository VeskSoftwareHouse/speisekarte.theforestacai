import type { CSSProperties } from 'react'

import type { HourHeatmap } from '../reportMetrics'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface Props {
  heatmap: HourHeatmap
}

/**
 * Mapa de calor de pedidos por hora e dia da semana. Só as horas em que a loja
 * de fato vendeu entram no eixo: um dia inteiro de 0h às 23h deixaria a faixa
 * do movimento espremida em um quarto da tela.
 */
export default function ReportHeatmap({ heatmap }: Props) {
  const activeHours = heatmap.byHour.flatMap((count, hour) => (count > 0 ? [hour] : []))

  if (!activeHours.length) {
    return <p className="report-empty">Nenhum pedido pago no período.</p>
  }

  const firstHour = Math.min(...activeHours)
  const lastHour = Math.max(...activeHours)
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i)

  return (
    <div className="report-heatmap">
      <div className="report-heatmap__grid" style={{ gridTemplateColumns: `auto repeat(${hours.length}, 1fr)` }}>
        <span className="report-heatmap__corner" />
        {hours.map((hour) => (
          <span key={hour} className="report-heatmap__hour">
            {String(hour).padStart(2, '0')}
          </span>
        ))}

        {WEEKDAYS.map((label, weekday) => (
          <Row key={label} label={label} counts={heatmap.cells[weekday]} hours={hours} max={heatmap.max} />
        ))}
      </div>

      <div className="report-heatmap__legend">
        <span>Menos</span>
        <span className="report-heatmap__scale">
          {[0.15, 0.4, 0.65, 0.85, 1].map((step) => (
            <i key={step} style={{ opacity: step }} />
          ))}
        </span>
        <span>Mais ({heatmap.max} pedidos na hora mais cheia)</span>
      </div>
    </div>
  )
}

function Row({ label, counts, hours, max }: { label: string; counts: number[]; hours: number[]; max: number }) {
  return (
    <>
      <span className="report-heatmap__weekday">{label}</span>
      {hours.map((hour) => {
        const count = counts[hour]
        // A opacidade parte de 0,12 para que uma célula com 1 pedido ainda
        // apareça — zerada, ela some no fundo e vira "sem dado".
        const opacity = max > 0 && count > 0 ? 0.12 + (count / max) * 0.88 : 0
        return (
          <span
            key={hour}
            className={`report-heatmap__cell ${count > 0 ? 'report-heatmap__cell--on' : ''}`}
            style={{ '--heat': opacity } as CSSProperties}
            title={`${label} ${String(hour).padStart(2, '0')}h — ${count} pedido(s)`}
          >
            {count > 0 ? count : ''}
          </span>
        )
      })}
    </>
  )
}
