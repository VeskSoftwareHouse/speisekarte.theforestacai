import { formatCHF } from '@shared/format'
import type { TrendPoint } from '../reportMetrics'

interface Props {
  points: TrendPoint[]
}

const WIDTH = 720
const HEIGHT = 240
const PADDING = { top: 16, right: 12, bottom: 30, left: 60 }

/**
 * Tendência de faturamento mês a mês. É um SVG desenhado à mão de propósito:
 * uma biblioteca de gráficos para uma linha só custaria mais em download do
 * que o painel inteiro pesa hoje.
 */
export default function ReportTrendChart({ points }: Props) {
  if (points.length < 2) {
    return <p className="report-empty">Ainda não há meses suficientes para uma tendência.</p>
  }

  const values = points.map((point) => point.faturamento)
  // O topo do eixo nunca é o próprio máximo: sobra uma folga para o último
  // ponto não encostar na borda de cima.
  const max = Math.max(...values, 1) * 1.1
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom

  const x = (index: number) => PADDING.left + (index / (points.length - 1)) * plotWidth
  const y = (value: number) => PADDING.top + plotHeight - (value / max) * plotHeight

  const linePath = points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(point.faturamento)}`).join(' ')
  const areaPath = `${linePath} L ${x(points.length - 1)} ${PADDING.top + plotHeight} L ${x(0)} ${
    PADDING.top + plotHeight
  } Z`

  const gridLines = [0, 0.5, 1]

  return (
    <div className="report-trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="report-trend__svg" role="img" aria-label="Faturamento mês a mês">
        {gridLines.map((step) => {
          const value = max * step
          return (
            <g key={step}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y(value)}
                y2={y(value)}
                className="report-trend__grid"
              />
              <text x={PADDING.left - 8} y={y(value) + 4} className="report-trend__axis" textAnchor="end">
                {Math.round(value)}
              </text>
            </g>
          )
        })}

        <path d={areaPath} className="report-trend__area" />
        <path d={linePath} className="report-trend__line" />

        {points.map((point, i) => (
          <g key={point.key}>
            <circle cx={x(i)} cy={y(point.faturamento)} r={4} className="report-trend__dot">
              <title>{`${point.label}: ${formatCHF(point.faturamento)} em ${point.pedidos} pedido(s)`}</title>
            </circle>
            <text x={x(i)} y={HEIGHT - 8} className="report-trend__axis" textAnchor="middle">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
