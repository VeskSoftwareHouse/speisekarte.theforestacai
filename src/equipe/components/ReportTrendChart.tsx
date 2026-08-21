import { useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { formatCHF } from '@shared/format'
import { formatVariation, variation, type TrendPoint } from '../reportMetrics'
import { TooltipBody, useTooltip } from './ReportTooltip'

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
 *
 * O gráfico inteiro é uma área de leitura: o cursor em qualquer lugar dele
 * gruda no mês mais próximo, marca a coluna com uma linha guia e abre o balão.
 * Perseguir um ponto de 4px com o mouse seria um teste de pontaria.
 */
export default function ReportTrendChart({ points }: Props) {
  const tooltip = useTooltip()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  if (points.length < 2) {
    return <p className="report-empty">Ainda não há meses suficientes para uma tendência.</p>
  }

  const values = points.map((point) => point.faturamento)
  // O topo do eixo nunca é o próprio máximo: sobra uma folga para o último
  // ponto não encostar na borda de cima.
  const max = Math.max(...values, 1) * 1.1
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const step = plotWidth / (points.length - 1)

  const x = (index: number) => PADDING.left + index * step
  const y = (value: number) => PADDING.top + plotHeight - (value / max) * plotHeight

  const linePath = points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(point.faturamento)}`).join(' ')
  const baseline = PADDING.top + plotHeight
  const areaPath = `${linePath} L ${x(points.length - 1)} ${baseline} L ${x(0)} ${baseline} Z`

  /** Índice do mês mais próximo do cursor, corrigindo a escala do viewBox. */
  function indexAt(event: ReactMouseEvent): number {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const svgX = ((event.clientX - rect.left) / rect.width) * WIDTH
    const index = Math.round((svgX - PADDING.left) / step)
    return Math.min(Math.max(index, 0), points.length - 1)
  }

  function handleMove(event: ReactMouseEvent) {
    const index = indexAt(event)
    setHovered(index)

    const point = points[index]
    const before = index > 0 ? points[index - 1] : null
    const change = before ? variation(point.faturamento, before.faturamento) : null

    tooltip.show(
      event,
      <TooltipBody
        title={point.label}
        lines={[
          formatCHF(point.faturamento),
          `${point.pedidos} ${point.pedidos === 1 ? 'pedido pago' : 'pedidos pagos'}`,
          point.pedidos > 0 && `ticket médio de ${formatCHF(point.faturamento / point.pedidos)}`,
          change !== null && `${formatVariation(change)} em relação a ${before?.label}`,
          index === points.length - 1 && 'Mês ainda em andamento: compare com cuidado',
        ]}
      />,
    )
  }

  function handleLeave() {
    setHovered(null)
    tooltip.hide()
  }

  const last = points.length - 1

  return (
    <div className="report-trend">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="report-trend__svg"
        role="img"
        aria-label="Faturamento mês a mês"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {[0, 0.5, 1].map((ratio) => {
          const value = max * ratio
          return (
            <g key={ratio}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y(value)} y2={y(value)} className="report-trend__grid" />
              <text x={PADDING.left - 10} y={y(value) + 4} className="report-trend__axis" textAnchor="end">
                {compact(value)}
              </text>
            </g>
          )
        })}

        {hovered !== null && (
          <line
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PADDING.top}
            y2={baseline}
            className="report-trend__guide"
          />
        )}

        <path d={areaPath} className="report-trend__area" />
        <path d={linePath} className="report-trend__line" />

        {points.map((point, i) => (
          <g key={point.key}>
            <circle
              cx={x(i)}
              cy={y(point.faturamento)}
              r={hovered === i ? 6 : i === last ? 5 : 3.5}
              className={`report-trend__dot ${i === last ? 'report-trend__dot--last' : ''} ${
                hovered === i ? 'report-trend__dot--hover' : ''
              }`}
            />
            <text
              x={x(i)}
              y={HEIGHT - 8}
              className={`report-trend__axis ${hovered === i ? 'report-trend__axis--hover' : ''}`}
              textAnchor="middle"
            >
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
