import { formatCHF } from '@shared/format'
import type { RankRow } from '../reportMetrics'

interface Props {
  rows: RankRow[]
  /** Qual número desenha a barra. O outro aparece como texto de apoio. */
  metric?: 'quantidade' | 'faturamento'
  /** Quantas linhas mostrar. Sem limite, mostra todas. */
  limit?: number
  /** Mostra as últimas colocadas em vez das primeiras (ranking dos menos vendidos). */
  fromBottom?: boolean
  empty?: string
}

/**
 * Ranking em barras. Serve a todos os "mais pedidos" do relatório (itens,
 * categorias, adicionais, tamanhos, formas de pagamento), então o eixo é
 * sempre relativo ao primeiro colocado da lista exibida — o que importa aqui
 * é a proporção entre eles, não o valor absoluto.
 */
export default function ReportBarList({ rows, metric = 'quantidade', limit, fromBottom = false, empty }: Props) {
  if (!rows.length) {
    return <p className="report-empty">{empty ?? 'Sem dados no período.'}</p>
  }

  const ordered = fromBottom ? [...rows].reverse() : rows
  const visible = limit ? ordered.slice(0, limit) : ordered
  const max = Math.max(...visible.map((row) => row[metric]), 0)

  return (
    <ol className="report-bars">
      {visible.map((row, index) => {
        const value = row[metric]
        const width = max > 0 ? Math.max((value / max) * 100, 2) : 0
        return (
          <li key={row.key} className="report-bar">
            <div className="report-bar__head">
              <span className="report-bar__position">{fromBottom ? rows.length - index : index + 1}</span>
              <span className="report-bar__label">{row.label}</span>
              <span className="report-bar__value">
                {metric === 'quantidade' ? `${row.quantidade} un.` : formatCHF(row.faturamento)}
              </span>
            </div>
            <div className="report-bar__track">
              <div className="report-bar__fill" style={{ width: `${width}%` }} />
            </div>
            <p className="report-bar__hint">
              {metric === 'quantidade' ? formatCHF(row.faturamento) : `${row.quantidade} un.`}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
