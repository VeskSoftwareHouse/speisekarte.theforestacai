import { Plus } from 'lucide-react'
import type { Insumo, Perda } from '@shared/types'
import { MOTIVO_PERDA_LABEL } from '@shared/types'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'

interface Props {
  perdas: Perda[]
  insumosById: Record<string, Insumo>
  onAdd: () => void
}

export default function PerdaPanel({ perdas, insumosById, onAdd }: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Perdas</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Nova perda
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {perdas.length === 0 && (
          <p className="admin-panel__empty">
            Nenhuma perda registrada. Perdas também aparecem aqui automaticamente quando uma contagem de inventário
            encontra menos estoque do que o sistema esperava.
          </p>
        )}

        {perdas.map((perda) => {
          const insumo = insumosById[perda.insumo_id]
          return (
            <article key={perda.id} className="admin-product-row">
              <div className="admin-product-row__info">
                <div className="admin-product-row__title">
                  <strong>{insumo?.nome ?? 'Insumo removido'}</strong>
                  <span className="admin-product-row__category">{MOTIVO_PERDA_LABEL[perda.motivo]}</span>
                  {perda.origem_tipo === 'inventario' && (
                    <span className="admin-product-row__category">Via inventário</span>
                  )}
                </div>
                <p className="admin-product-row__desc">
                  {perda.observacoes ?? '—'}
                  {' · '}
                  {new Date(perda.criado_em).toLocaleString('pt-BR')}
                </p>
              </div>

              <strong style={{ color: 'var(--color-danger)' }}>
                -{perda.quantidade} {insumo ? UNIDADE_LABEL[insumo.unidade] : ''}
              </strong>
            </article>
          )
        })}
      </div>
    </section>
  )
}
