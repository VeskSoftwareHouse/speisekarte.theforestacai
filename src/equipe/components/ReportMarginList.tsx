import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import type { Insumo } from '@shared/types'
import { formatPercent } from '../reportMetrics'
import type { MarginRow } from '../lucroCalc'

interface Props {
  rows: MarginRow[]
  insumoById: Map<string, Pick<Insumo, 'nome' | 'unidade'>>
  limit?: number
  empty?: string
}

/** Poucas casas decimais bastam pra ler a quantidade de um insumo numa receita (ex: "0,364"). */
function formatQuantidade(quantidade: number): string {
  return quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/**
 * Margem por produto: receita, custo (a partir da composição/vínculo atuais
 * e do custo médio das compras já recebidas) e o que sobra. Quando algum
 * insumo usado nunca foi comprado, o custo daquele produto é uma
 * subestimativa — a margem então não aparece como número, só "custo
 * incompleto", pra não fingir uma precisão que não existe.
 *
 * "Ver detalhamento" abre a composição de custo insumo a insumo — clique em
 * vez de hover porque o Painel roda em tablet, onde não há mouse parado
 * pra sustentar um tooltip.
 */
export default function ReportMarginList({ rows, insumoById, limit, empty }: Props) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  if (!rows.length) {
    return <p className="report-empty">{empty ?? 'Sem dados no período.'}</p>
  }

  const visible = limit ? rows.slice(0, limit) : rows

  function alternar(key: string) {
    setAbertos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <ul className="report-margin-list">
      {visible.map((row) => {
        const margem = row.receita - row.custo
        const percentual = row.receita > 0 ? margem / row.receita : null
        const tone = !row.custoCompleto ? 'unknown' : margem < 0 ? 'negative' : 'positive'
        const badge = !row.custoCompleto ? 'custo incompleto' : percentual !== null ? formatPercent(percentual, 0) : '—'

        // Barra: quanto da receita virou custo vs. quanto sobrou de margem —
        // uma perda (custo > receita) enche a barra inteira de vermelho em
        // vez de tentar mostrar segmentos que passariam de 100%.
        const perda = row.receita > 0 && margem < 0
        const custoPct = row.receita > 0 ? Math.min(100, (row.custo / row.receita) * 100) : 0
        const margemPct = Math.max(0, 100 - custoPct)

        const aberto = abertos.has(row.key)
        const temDetalhe = row.detalheInsumos.length > 0

        return (
          <li key={row.key} className="report-margin-row">
            <div className="report-margin-row__head">
              <span className="report-margin-row__label">{row.label}</span>
              <span className="report-margin-row__receita">{formatCHF(row.receita)}</span>
              <span className={`report-margin-row__badge report-margin-row__badge--${tone}`}>{badge}</span>
            </div>

            {row.receita > 0 && (
              <div className="report-margin-row__bar">
                {perda ? (
                  <div className="report-margin-row__bar-segment report-margin-row__bar-segment--negative" style={{ width: '100%' }} />
                ) : (
                  <>
                    <div className="report-margin-row__bar-segment report-margin-row__bar-segment--custo" style={{ width: `${custoPct}%` }} />
                    <div className="report-margin-row__bar-segment report-margin-row__bar-segment--margem" style={{ width: `${margemPct}%` }} />
                  </>
                )}
              </div>
            )}

            <div className="report-margin-row__figures">
              <div className="report-margin-row__figure">
                <span className="report-margin-row__figure-label">Custo{!row.custoCompleto && ' (parcial)'}</span>
                <strong>{formatCHF(row.custo)}</strong>
              </div>
              <div className="report-margin-row__figure report-margin-row__figure--margem">
                <span className="report-margin-row__figure-label">Margem</span>
                <strong>{formatCHF(margem)}</strong>
              </div>
            </div>

            {temDetalhe && (
              <button
                type="button"
                className="report-margin-row__toggle"
                onClick={() => alternar(row.key)}
                aria-expanded={aberto}
              >
                <ChevronDown size={14} strokeWidth={2.5} className={aberto ? 'report-margin-row__toggle-icon--open' : ''} />
                {aberto ? 'Ocultar detalhamento' : 'Ver detalhamento dos insumos'}
              </button>
            )}

            {aberto && temDetalhe && (
              <div className="report-margin-row__detalhe">
                {row.detalheInsumos.map((d) => {
                  const insumo = insumoById.get(d.insumoId)
                  const participacao = row.custo > 0 ? (d.custo / row.custo) * 100 : 0
                  return (
                    <div key={d.insumoId} className="report-margin-row__detalhe-item">
                      <div className="report-margin-row__detalhe-item__top">
                        <span className="report-margin-row__detalhe-item__nome">{insumo?.nome ?? 'Insumo removido'}</span>
                        <span className="report-margin-row__detalhe-item__custo">{formatCHF(d.custo)}</span>
                      </div>
                      <div className="report-margin-row__detalhe-item__bar">
                        <div className="report-margin-row__detalhe-item__bar-fill" style={{ width: `${participacao}%` }} />
                      </div>
                      <span className="report-margin-row__detalhe-item__qtd">
                        {formatQuantidade(d.quantidade)} {insumo ? UNIDADE_LABEL[insumo.unidade] : ''} usados nesse período
                        {d.imposto > 0.005 && ` · ${formatCHF(d.imposto)} de imposto`}
                      </span>
                    </div>
                  )
                })}
                {!row.custoCompleto && (
                  <p className="report-margin-row__detalhe-aviso">
                    Algum insumo usado neste produto ainda não tem custo cadastrado (nenhuma compra recebida) e por
                    isso não aparece aqui — o custo total acima é uma subestimativa.
                  </p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
