import { formatCHF } from '@shared/format'
import { formatPercent, formatRankQuantity, type RankRow, type RankUnit } from '../reportMetrics'
import { useTooltipBody } from './ReportTooltip'

interface Props {
  rows: RankRow[]
  /** Qual número desenha a barra. O outro aparece ao lado, apagado. */
  metric?: 'quantidade' | 'faturamento'
  /** O que a quantidade conta nesta lista — ver `RankUnit`. */
  unit?: RankUnit
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
 * é a proporção entre os itens, não o valor absoluto. Quem quiser a fatia real
 * sobre o total encontra no balão ao passar o mouse.
 */
export default function ReportBarList({
  rows,
  metric = 'quantidade',
  unit = 'itens',
  limit,
  fromBottom = false,
  empty,
}: Props) {
  const tooltip = useTooltipBody()

  if (!rows.length) {
    return <p className="report-empty">{empty ?? 'Sem dados no período.'}</p>
  }

  const ordered = fromBottom ? [...rows].reverse() : rows
  const visible = limit ? ordered.slice(0, limit) : ordered
  const max = Math.max(...visible.map((row) => row[metric]), 0)

  // As fatias são sobre a lista inteira, não sobre as linhas visíveis: "35% do
  // total" com um top 8 recortado seria uma porcentagem de um recorte.
  const totalQuantidade = rows.reduce((sum, row) => sum + row.quantidade, 0)
  const totalFaturamento = rows.reduce((sum, row) => sum + row.faturamento, 0)

  /**
   * O número de apoio, ao lado do principal. Vazio quando não diz nada:
   * adicional grátis não tem receita para mostrar, e uma coluna de "CHF 0,00"
   * repetida oito vezes só rouba a atenção do que varia.
   */
  const aside = (row: RankRow): string => {
    if (metric === 'quantidade') return row.faturamento > 0 ? formatCHF(row.faturamento) : ''
    return row.quantidade > 0 ? formatRankQuantity(row.quantidade, unit) : ''
  }

  const detail = (row: RankRow): (string | false)[] => [
    `${formatRankQuantity(row.quantidade, unit)}${
      totalQuantidade > 0 ? ` · ${formatPercent(row.quantidade / totalQuantidade, 0)} do total` : ''
    }`,
    row.faturamento > 0 &&
      `${formatCHF(row.faturamento)}${
        totalFaturamento > 0 ? ` · ${formatPercent(row.faturamento / totalFaturamento, 0)} do faturamento` : ''
      }`,
    row.faturamento > 0 &&
      row.quantidade > 0 &&
      `${formatCHF(row.faturamento / row.quantidade)} por ${formatRankQuantity(1, unit).replace('1 ', '')}`,
    row.faturamento === 0 && unit === 'vezes' && 'Adicional sem custo: não soma faturamento',
  ]

  return (
    <ul className="report-bars">
      {visible.map((row) => {
        const width = max > 0 ? Math.max((row[metric] / max) * 100, 1.5) : 0
        return (
          <li key={row.key} className="report-bar" {...tooltip(row.label, detail(row))}>
            <div className="report-bar__head">
              <span className="report-bar__label">{row.label}</span>
              {aside(row) && <span className="report-bar__aside">{aside(row)}</span>}
              <span className="report-bar__value">
                {metric === 'quantidade' ? formatRankQuantity(row.quantidade, unit) : formatCHF(row.faturamento)}
              </span>
            </div>
            <div className="report-bar__track">
              <div
                className={`report-bar__fill ${fromBottom ? 'report-bar__fill--low' : ''}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
