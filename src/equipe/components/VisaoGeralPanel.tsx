import type { Imposto, Insumo, MovimentacaoEstoque, PedidoCompraWithItens, Perda } from '@shared/types'
import { MOTIVO_PERDA_LABEL, MOVIMENTACAO_TIPO_LABEL } from '@shared/types'
import { formatCHF } from '@shared/format'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import { valorUnitarioComImposto } from '../estoqueCalc'

const RECENTES_LIMIT = 8

interface Props {
  insumos: Insumo[]
  saldoPorInsumo: Record<string, number>
  movimentos: MovimentacaoEstoque[]
  perdas: Perda[]
  pedidosCompra: PedidoCompraWithItens[]
  impostos: Imposto[]
}

/**
 * Painel de abertura do módulo de Estoque — não busca nada por conta
 * própria, só reorganiza o que os outros hooks (useEstoqueMovimentos,
 * usePerdasAdmin, useComprasAdmin) já carregam, num resumo rápido de ler.
 */
export default function VisaoGeralPanel({ insumos, saldoPorInsumo, movimentos, perdas, pedidosCompra, impostos }: Props) {
  const insumosBaixos = insumos.filter(
    (i) => i.ativo && i.estoque_minimo != null && (saldoPorInsumo[i.id] ?? 0) < i.estoque_minimo,
  )

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const totalComprasDoMes = pedidosCompra
    .filter((p) => p.status === 'recebido' && p.recebido_em && new Date(p.recebido_em) >= inicioMes)
    .reduce(
      (sum, p) =>
        sum +
        p.itens.reduce(
          (s, it) => s + valorUnitarioComImposto(it.valor_unitario ?? 0, it.insumo_id, impostos) * it.quantidade,
          0,
        ),
      0,
    )

  const insumosById: Record<string, Insumo> = {}
  for (const i of insumos) insumosById[i.id] = i

  return (
    <div className="visao-geral">
      <div className="visao-geral__stats">
        <div className="visao-geral__stat">
          <span>Insumos com saldo baixo</span>
          <strong className={insumosBaixos.length > 0 ? 'visao-geral__stat--warn' : ''}>{insumosBaixos.length}</strong>
        </div>
        <div className="visao-geral__stat">
          <span>Compras recebidas este mês</span>
          <strong>{formatCHF(totalComprasDoMes)}</strong>
        </div>
        <div className="visao-geral__stat">
          <span>Perdas registradas (total)</span>
          <strong>{perdas.length}</strong>
        </div>
      </div>

      <section className="visao-geral__insumos">
        <h2 className="visao-geral__insumos-title">Estoque por insumo</h2>
        {insumos.length === 0 ? (
          <p className="admin-panel__empty">Nenhum insumo cadastrado ainda.</p>
        ) : (
          <div className="visao-geral__insumos-grid">
            {insumos
              .filter((i) => i.ativo)
              .map((i) => {
                const saldo = saldoPorInsumo[i.id] ?? 0
                const baixo = i.estoque_minimo != null && saldo < i.estoque_minimo
                return (
                  <div key={i.id} className={`visao-geral__insumo-card ${baixo ? 'visao-geral__insumo-card--warn' : ''}`}>
                    <span className="visao-geral__insumo-card__nome">{i.nome}</span>
                    <strong className="visao-geral__insumo-card__saldo">
                      {saldo} <small>{UNIDADE_LABEL[i.unidade]}</small>
                    </strong>
                    {baixo && <span className="visao-geral__insumo-card__badge">Saldo baixo</span>}
                  </div>
                )
              })}
          </div>
        )}
      </section>

      <div className="visao-geral__columns">
        <section className="admin-panel admin-panel--products">
          <header className="admin-panel__header">
            <h2>Últimas movimentações</h2>
          </header>
          <div className="admin-panel__body admin-product-list">
            {movimentos.length === 0 && <p className="admin-panel__empty">Nenhuma movimentação ainda.</p>}
            {movimentos.slice(0, RECENTES_LIMIT).map((mov) => {
              const insumo = insumosById[mov.insumo_id]
              const positivo = mov.quantidade > 0
              return (
                <article key={mov.id} className="admin-product-row">
                  <div className="admin-product-row__info">
                    <div className="admin-product-row__title">
                      <strong>{insumo?.nome ?? 'Insumo removido'}</strong>
                      <span className="admin-product-row__category">{MOVIMENTACAO_TIPO_LABEL[mov.tipo]}</span>
                    </div>
                    <p className="admin-product-row__desc">{new Date(mov.criado_em).toLocaleString('pt-BR')}</p>
                  </div>
                  <strong style={{ color: positivo ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {positivo ? '+' : ''}
                    {mov.quantidade} {insumo ? UNIDADE_LABEL[insumo.unidade] : ''}
                  </strong>
                </article>
              )
            })}
          </div>
        </section>

        <section className="admin-panel admin-panel--products">
          <header className="admin-panel__header">
            <h2>Perdas recentes</h2>
          </header>
          <div className="admin-panel__body admin-product-list">
            {perdas.length === 0 && <p className="admin-panel__empty">Nenhuma perda registrada.</p>}
            {perdas.slice(0, RECENTES_LIMIT).map((perda) => {
              const insumo = insumosById[perda.insumo_id]
              return (
                <article key={perda.id} className="admin-product-row">
                  <div className="admin-product-row__info">
                    <div className="admin-product-row__title">
                      <strong>{insumo?.nome ?? 'Insumo removido'}</strong>
                      <span className="admin-product-row__category">{MOTIVO_PERDA_LABEL[perda.motivo]}</span>
                    </div>
                    <p className="admin-product-row__desc">{new Date(perda.criado_em).toLocaleString('pt-BR')}</p>
                  </div>
                  <strong style={{ color: 'var(--color-danger)' }}>
                    -{perda.quantidade} {insumo ? UNIDADE_LABEL[insumo.unidade] : ''}
                  </strong>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
