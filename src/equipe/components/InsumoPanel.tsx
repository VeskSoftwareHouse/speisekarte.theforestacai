import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Insumo } from '@shared/types'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'

interface Props {
  insumos: Insumo[]
  onAdd: () => void
  onEdit: (insumo: Insumo) => void
  onDelete: (insumo: Insumo) => void
}

export default function InsumoPanel({ insumos, onAdd, onEdit, onDelete }: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Insumos</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo insumo
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {insumos.length === 0 && (
          <p className="admin-panel__empty">
            Nenhum insumo cadastrado. Cadastre os ingredientes que você quer controlar em estoque (açaí, banana,
            copos, colheres...).
          </p>
        )}

        {insumos.map((insumo) => (
          <article key={insumo.id} className={`admin-product-row ${insumo.ativo ? '' : 'admin-product-row--off'}`}>
            <div className="admin-product-row__info">
              <div className="admin-product-row__title">
                <strong>{insumo.nome}</strong>
                <span className="admin-product-row__category">{UNIDADE_LABEL[insumo.unidade]}</span>
                {!insumo.ativo && <span className="admin-product-row__category">Inativo</span>}
              </div>
              {insumo.estoque_minimo != null && (
                <p className="admin-product-row__desc">
                  Alerta de saldo baixo abaixo de {insumo.estoque_minimo} {UNIDADE_LABEL[insumo.unidade]}
                </p>
              )}
            </div>

            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(insumo)} aria-label="Editar insumo">
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(insumo)}
                aria-label="Excluir insumo"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
