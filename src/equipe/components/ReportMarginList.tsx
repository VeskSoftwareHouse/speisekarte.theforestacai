import { formatCHF } from '@shared/format'
import { formatPercent } from '../reportMetrics'
import type { MarginRow } from '../lucroCalc'
import { useTooltipBody } from './ReportTooltip'

interface Props {
  rows: MarginRow[]
  limit?: number
  empty?: string
}

/**
 * Margem por produto: receita, custo (a partir da composição/vínculo atuais
 * e do custo médio das compras já recebidas) e o que sobra. Quando algum
 * insumo usado nunca foi comprado, o custo daquele produto é uma
 * subestimativa — a margem então não aparece como número, só "custo
 * incompleto", pra não fingir uma precisão que não existe.
 */
export default function ReportMarginList({ rows, limit, empty }: Props) {
  const tooltip = useTooltipBody()

  if (!rows.length) {
    return <p className="report-empty">{empty ?? 'Sem dados no período.'}</p>
  }

  const visible = limit ? rows.slice(0, limit) : rows

  return (
    <ul className="report-margin-list">
      {visible.map((row) => {
        const margem = row.receita - row.custo
        const percentual = row.receita > 0 ? margem / row.receita : null
        const tone = !row.custoCompleto ? 'unknown' : margem < 0 ? 'negative' : 'positive'
        const badge = !row.custoCompleto ? 'custo incompleto' : percentual !== null ? formatPercent(percentual, 0) : '—'

        return (
          <li
            key={row.key}
            className="report-margin-row"
            {...tooltip(row.label, [
              `${formatCHF(row.receita)} de receita`,
              `${formatCHF(row.custo)} de custo${!row.custoCompleto ? ' (parcial — falta custo de algum insumo usado)' : ''}`,
              `${formatCHF(margem)} de margem`,
            ])}
          >
            <div className="report-margin-row__head">
              <span className="report-margin-row__label">{row.label}</span>
              <span className={`report-margin-row__badge report-margin-row__badge--${tone}`}>{badge}</span>
            </div>
            <div className="report-margin-row__figures">
              <span>{formatCHF(row.receita)} receita</span>
              <span>
                {formatCHF(row.custo)} custo{!row.custoCompleto && ' (parcial)'}
              </span>
              <span>
                <b>{formatCHF(margem)}</b> margem
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
