import { Plus } from 'lucide-react'
import type { Insumo, MovimentacaoEstoque } from '@shared/types'
import { MOVIMENTACAO_TIPO_LABEL } from '@shared/types'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'

interface Props {
  insumos: Insumo[]
  saldoPorInsumo: Record<string, number>
  movimentos: MovimentacaoEstoque[]
  onAdd: () => void
}

export default function MovimentacaoPanel({ insumos, saldoPorInsumo, movimentos, onAdd }: Props) {
  const insumosById: Record<string, Insumo> = {}
  for (const i of insumos) insumosById[i.id] = i

  const insumosBaixos = insumos.filter(
    (i) => i.ativo && i.estoque_minimo != null && (saldoPorInsumo[i.id] ?? 0) < i.estoque_minimo,
  )

  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Movimentações de estoque</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo lançamento
        </button>
      </header>

      {insumosBaixos.length > 0 && (
        <p className="admin-panel__hint admin-panel__hint--warn">
          Saldo baixo: {insumosBaixos.map((i) => `${i.nome} (${saldoPorInsumo[i.id] ?? 0} ${UNIDADE_LABEL[i.unidade]})`).join(', ')}
        </p>
      )}

      <div className="admin-panel__body admin-product-list">
        {movimentos.length === 0 && (
          <p className="admin-panel__empty">
            Nenhuma movimentação ainda. Elas aparecem aqui quando um pedido de compra é recebido, um lançamento
            manual é feito, ou (mais adiante) quando um pedido é fechado.
          </p>
        )}

        {movimentos.map((mov) => {
          const insumo = insumosById[mov.insumo_id]
          const positivo = mov.quantidade > 0
          return (
            <article key={mov.id} className="admin-product-row">
              <div className="admin-product-row__info">
                <div className="admin-product-row__title">
                  <strong>{insumo?.nome ?? 'Insumo removido'}</strong>
                  <span className="admin-product-row__category">{MOVIMENTACAO_TIPO_LABEL[mov.tipo]}</span>
                </div>
                <p className="admin-product-row__desc">
                  {mov.observacoes ?? '—'}
                  {' · '}
                  {new Date(mov.criado_em).toLocaleString('pt-BR')}
                </p>
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
  )
}
