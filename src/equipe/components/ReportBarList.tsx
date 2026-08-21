import { formatCHF } from '@shared/format'
import { formatPercent, formatRankQuantity, type RankRow, type RankUnit } from '../reportMetrics'
import { useTooltipBody } from './ReportTooltip'

interface Props {
  rows: RankRow[]
  /** Qual número a barra mede. O outro fica ao lado, apagado. */
  metric?: 'quantidade' | 'faturamento'
  /** O que a quantidade conta nesta lista — ver `RankUnit`. */
  unit?: RankUnit
  /** Quantas linhas mostrar. Sem limite, mostra todas. */
  limit?: number
  /** `low` pinta de dourado: a lista é de quem está saindo pouco. */
  tone?: 'default' | 'low'
  /** `asc` começa pelo menor — é o que a lista de encalhados quer. */
  order?: 'desc' | 'asc'
  /**
   * Ranking completo de onde `rows` foi recortado. É contra ele que a barra e
   * a porcentagem se medem: sem isto, uma lista só de encalhados normaliza a
   * escala entre eles mesmos, e o pior de todos aparece com a barra cheia.
   */
  reference?: RankRow[]
  empty?: string
}

/**
 * Ranking em barras, usado por todos os "mais pedidos" do relatório.
 *
 * Cada linha traz um número em destaque — o que a barra mede — e o outro
 * colado nele, apagado. Ficavam antes em colunas separadas e distantes, o que
 * os fazia parecer duas medidas concorrentes sem cabeçalho que dissesse qual
 * era qual.
 *
 * A barra é sempre proporcional ao primeiro colocado do ranking inteiro, e não
 * ao da fatia exibida. Numa lista de encalhados isso importa: com a escala
 * presa ao trecho visível, quatro produtos de uma venda cada apareciam com a
 * barra cheia, exatamente a leitura oposta da verdadeira.
 */
export default function ReportBarList({
  rows,
  metric = 'quantidade',
  unit = 'itens',
  limit,
  tone = 'default',
  order = 'desc',
  reference,
  empty,
}: Props) {
  const tooltip = useTooltipBody()

  if (!rows.length) {
    return <p className="report-empty">{empty ?? 'Sem dados no período.'}</p>
  }

  // A ordem segue o número que a barra mede. Sem isto, uma lista ordenada por
  // quantidade e desenhada por faturamento descia com as barras subindo e
  // descendo no meio do caminho, e o ranking parecia errado.
  const ranked = [...rows].sort((a, b) =>
    order === 'asc' ? a[metric] - b[metric] || a.faturamento - b.faturamento : b[metric] - a[metric] || b.faturamento - a.faturamento,
  )
  const visible = limit ? ranked.slice(0, limit) : ranked

  // Escala e porcentagem saem do ranking inteiro, nunca das linhas visíveis:
  // "35% do total" calculado sobre um top 8 recortado seria a fatia do recorte.
  const base = reference ?? rows
  const max = Math.max(...base.map((row) => row[metric]), 0)
  const totalQuantidade = base.reduce((sum, row) => sum + row.quantidade, 0)
  const totalFaturamento = base.reduce((sum, row) => sum + row.faturamento, 0)
  const total = metric === 'quantidade' ? totalQuantidade : totalFaturamento

  const detail = (row: RankRow): (string | false)[] => [
    row.quantidade > 0 &&
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
    row.quantidade === 0 && 'Nenhuma venda no período, e o produto está disponível no cardápio',
    row.faturamento === 0 && row.quantidade > 0 && unit === 'vezes' && 'Adicional sem custo: não soma faturamento',
  ]

  return (
    <ul className="report-bars">
      {visible.map((row) => {
        const width = max > 0 ? (row[metric] / max) * 100 : 0
        // "0 itens" descreve o fato sem dar o recado; "nenhuma venda" é o
        // recado, e é por ele que este produto está na lista.
        const quantidade = row.quantidade === 0 ? 'nenhuma venda' : formatRankQuantity(row.quantidade, unit)
        const dinheiro = formatCHF(row.faturamento)
        return (
          <li key={row.key} className="report-bar" {...tooltip(row.label, detail(row))}>
            <div className="report-bar__head">
              <span className="report-bar__label">{row.label}</span>
              <span className="report-bar__figures">
                <b>{metric === 'quantidade' ? quantidade : dinheiro}</b>
                {/* O segundo número só entra quando acrescenta: adicional grátis
                    repetindo "CHF 0,00" oito vezes é ruído. */}
                {metric === 'quantidade'
                  ? row.faturamento > 0 && <span>{dinheiro}</span>
                  : row.quantidade > 0 && <span>{quantidade}</span>}
              </span>
            </div>
            <div className="report-bar__scale">
              <div className="report-bar__track">
                <div
                  className={`report-bar__fill ${tone === 'low' ? 'report-bar__fill--low' : ''}`}
                  style={{ width: `${Math.max(width, row[metric] > 0 ? 1.5 : 0)}%` }}
                />
              </div>
              {/* A porcentagem rotula a barra: sem ela, o comprimento só se lê
                  comparando com as vizinhas. */}
              <span className="report-bar__share">{total > 0 ? formatPercent(row[metric] / total, 0) : '—'}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
