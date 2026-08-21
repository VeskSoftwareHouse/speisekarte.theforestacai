import type { CSSProperties } from 'react'

import type { HourHeatmap } from '../reportMetrics'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface Props {
  heatmap: HourHeatmap
}

/**
 * Mapa de calor de pedidos por hora e dia da semana.
 *
 * Só as horas em que a loja de fato vendeu entram no eixo: um dia inteiro de
 * 0h às 23h espremeria a faixa do movimento em um quarto da largura. E as
 * células não trazem número — 77 números pequenos brigando entre si escondem
 * exatamente o que o mapa existe para mostrar, que é onde está o vermelho.
 * O número continua a um toque de distância, no tooltip.
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
        <span />
        {hours.map((hour) => (
          <span key={hour} className="report-heatmap__hour">
            {String(hour).padStart(2, '0')}
          </span>
        ))}

        {WEEKDAYS.map((label, weekday) => (
          <Row key={label} label={label} counts={heatmap.cells[weekday]} hours={hours} max={heatmap.max} />
        ))}
      </div>

      <p className="report-heatmap__legend">
        Cada quadrado é uma hora de um dia da semana. Quanto mais escuro, mais pedidos — o mais cheio teve{' '}
        <strong>{heatmap.max}</strong>.
      </p>
    </div>
  )
}

function Row({ label, counts, hours, max }: { label: string; counts: number[]; hours: number[]; max: number }) {
  return (
    <>
      <span className="report-heatmap__weekday">{label}</span>
      {hours.map((hour) => {
        const count = counts[hour]
        // A intensidade parte de 0,14 para que uma célula com 1 pedido ainda
        // se distinga do fundo; zerada, ela viraria "sem dado".
        const heat = max > 0 && count > 0 ? 0.14 + (count / max) * 0.86 : 0
        return (
          <span
            key={hour}
            className={`report-heatmap__cell ${count > 0 ? 'report-heatmap__cell--on' : ''}`}
            style={{ '--heat': heat } as CSSProperties}
            title={`${label}, ${String(hour).padStart(2, '0')}h — ${count} pedido(s)`}
          />
        )
      })}
    </>
  )
}
