import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Modifier } from '@shared/types'

const TIPO_LABEL: Record<Modifier['tipo'], string> = {
  obrigatorio: 'Obrigatório',
  opcional: 'Opcional',
}

interface Props {
  groups: Modifier[]
  optionCountByGroup: Record<string, number>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onEdit: (group: Modifier) => void
  onDelete: (group: Modifier) => void
}

export default function ModifierGroupPanel({
  groups,
  optionCountByGroup,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  return (
    <section className="admin-panel admin-panel--categories">
      <header className="admin-panel__header">
        <h2>Categorias de adicionais</h2>
        <button className="admin-icon-btn" onClick={onAdd} aria-label="Nova categoria de adicionais">
          <Plus size={18} strokeWidth={2.5} />
        </button>
      </header>

      <div className="admin-panel__body">
        <button
          className={`admin-category-row ${selectedId === null ? 'admin-category-row--active' : ''}`}
          onClick={() => onSelect(null)}
        >
          <span>Todas</span>
        </button>
        {groups.map((g) => (
          <div key={g.id} className={`admin-category-row ${selectedId === g.id ? 'admin-category-row--active' : ''}`}>
            <button className="admin-category-row__label" onClick={() => onSelect(g.id)}>
              <span>
                {g.nome}
                <span className="admin-modifier-tag">{TIPO_LABEL[g.tipo]}</span>
              </span>
              <span className="admin-category-row__count">{optionCountByGroup[g.id] ?? 0}</span>
            </button>
            <div className="admin-category-row__actions">
              <button
                className="admin-icon-btn admin-icon-btn--sm"
                onClick={() => onEdit(g)}
                aria-label={`Editar ${g.nome}`}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--sm admin-icon-btn--danger"
                onClick={() => onDelete(g)}
                aria-label={`Excluir ${g.nome}`}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="admin-panel__empty">Nenhuma categoria de adicionais ainda.</p>}
      </div>
    </section>
  )
}
