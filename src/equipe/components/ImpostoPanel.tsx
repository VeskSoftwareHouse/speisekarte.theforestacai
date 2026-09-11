import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Imposto, Insumo } from '@shared/types'
import { formatTipLabel } from '@shared/format'

interface Props {
  impostos: Imposto[]
  insumosById: Record<string, Insumo>
  onAdd: () => void
  onEdit: (imposto: Imposto) => void
  onDelete: (imposto: Imposto) => void
}

export default function ImpostoPanel({ impostos, insumosById, onAdd, onEdit, onDelete }: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Impostos</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo imposto
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {impostos.length === 0 && (
          <p className="admin-panel__empty">
            Nenhum imposto cadastrado. Vincule um a um insumo (ex: taxa de importação do açaí) pra ele entrar no
            custo das compras — ou cadastre solto, só de registro.
          </p>
        )}

        {impostos.map((imposto) => (
          <article key={imposto.id} className={`admin-product-row ${imposto.ativo ? '' : 'admin-product-row--off'}`}>
            <div className="admin-product-row__info">
              <div className="admin-product-row__title">
                <strong>{imposto.nome}</strong>
                <span className="admin-product-row__category">{formatTipLabel(imposto)}</span>
                {!imposto.ativo && <span className="admin-product-row__category">Inativo</span>}
              </div>
              <p className="admin-product-row__desc">
                {imposto.insumo_id ? (insumosById[imposto.insumo_id]?.nome ?? 'Insumo removido') : 'Sem vínculo com insumo'}
              </p>
            </div>

            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(imposto)} aria-label="Editar imposto">
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(imposto)}
                aria-label="Excluir imposto"
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
