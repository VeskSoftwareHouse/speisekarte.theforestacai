import { formatCHF } from '@shared/format'
import type { RankRow } from '../reportMetrics'

interface Props {
  rows: RankRow[]
  /** Qual número desenha a barra. O outro aparece ao lado, apagado. */
  metric?: 'quantidade' | 'faturamento'
  /** Quantas linhas mostrar. Sem limite, mostra todas. */
  limit?: number
  /** Começa pelo último colocado (ranking dos que menos saem). */
  fromBottom?: boolean
  empty?: string
}

/**
 * Ranking em barras, usado por todos os "mais pedidos" do relatório.
 *
 * Duas linhas por item e nada mais: nome e números em cima, barra embaixo. A
 * posição numerada saiu porque o comprimento da barra já diz quem vem antes,
 * e numerar de trás para frente na lista dos menos vendidos ("13, 12, 11…")
 * só fazia o leitor parar para entender a contagem.
 *
 * A barra é relativa ao primeiro colocado da lista exibida — o que se lê aqui
 * é a proporção entre os itens, não o valor absoluto.
 */
export default function ReportBarList({ rows, metric = 'quantidade', limit, fromBottom = false, empty }: Props) {
  if (!rows.length) {
    return <p className="report-empty">{empty ?? 'Sem dados no período.'}</p>
  }

  const ordered = fromBottom ? [...rows].reverse() : rows
  const visible = limit ? ordered.slice(0, limit) : ordered
  const max = Math.max(...visible.map((row) => row[metric]), 0)

  return (
    <ul className="report-bars">
      {visible.map((row) => {
        const value = row[metric]
        const width = max > 0 ? Math.max((value / max) * 100, 1.5) : 0
        return (
          <li key={row.key} className="report-bar">
            <div className="report-bar__head">
              <span className="report-bar__label">{row.label}</span>
              {/* Adicional grátis não tem receita para mostrar, e uma coluna de
                  "CHF 0,00" repetida oito vezes só rouba a atenção do que varia. */}
              {aside(row, metric) && <span className="report-bar__aside">{aside(row, metric)}</span>}
              <span className="report-bar__value">
                {metric === 'quantidade' ? `${row.quantidade} un.` : formatCHF(row.faturamento)}
              </span>
            </div>
            <div className="report-bar__track">
              <div className={`report-bar__fill ${fromBottom ? 'report-bar__fill--low' : ''}`} style={{ width: `${width}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** O número de apoio, ao lado do principal. Vazio quando não diz nada. */
function aside(row: RankRow, metric: 'quantidade' | 'faturamento'): string {
  if (metric === 'quantidade') return row.faturamento > 0 ? formatCHF(row.faturamento) : ''
  return row.quantidade > 0 ? `${row.quantidade} un.` : ''
}
