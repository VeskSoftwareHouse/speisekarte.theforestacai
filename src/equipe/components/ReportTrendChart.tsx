import { formatCHF } from '@shared/format'
import type { TrendPoint } from '../reportMetrics'

interface Props {
  points: TrendPoint[]
}

const WIDTH = 720
const HEIGHT = 220
const PADDING = { top: 14, right: 10, bottom: 28, left: 52 }

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
  const baseline = PADDING.top + plotHeight
  const areaPath = `${linePath} L ${x(points.length - 1)} ${baseline} L ${x(0)} ${baseline} Z`

  const last = points[points.length - 1]

  return (
    <div className="report-trend">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="report-trend__svg" role="img" aria-label="Faturamento mês a mês">
        {[0, 0.5, 1].map((step) => {
          const value = max * step
          return (
            <g key={step}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(value)} y2={y(value)} className="report-trend__grid" />
              <text x={PADDING.left - 10} y={y(value) + 4} className="report-trend__axis" textAnchor="end">
                {compact(value)}
              </text>
            </g>
          )
        })}

        <path d={areaPath} className="report-trend__area" />
        <path d={linePath} className="report-trend__line" />

        {points.map((point, i) => (
          <g key={point.key}>
            {/* Alvo generoso e invisível: o tooltip pega o mês inteiro, não só
                o ponto de 4px. */}
            <rect
              x={x(i) - plotWidth / (points.length - 1) / 2}
              y={PADDING.top}
              width={plotWidth / (points.length - 1)}
              height={plotHeight}
              fill="transparent"
            >
              <title>{`${point.label}: ${formatCHF(point.faturamento)} em ${point.pedidos} pedido(s)`}</title>
            </rect>
            <circle
              cx={x(i)}
              cy={y(point.faturamento)}
              r={point.key === last.key ? 5 : 3.5}
              className={`report-trend__dot ${point.key === last.key ? 'report-trend__dot--last' : ''}`}
            />
            <text x={x(i)} y={HEIGHT - 8} className="report-trend__axis" textAnchor="middle">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

/** "11,7 mil" em vez de "11713" — o eixo é referência, não extrato. */
function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} mil`
  return String(Math.round(value))
}
