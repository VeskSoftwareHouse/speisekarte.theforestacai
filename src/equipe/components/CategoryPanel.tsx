import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Category } from '@shared/types'

interface Props {
  categories: Category[]
  itemCountByCategory: Record<string, number>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

export default function CategoryPanel({
  categories,
  itemCountByCategory,
  selectedId,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  return (
    <section className="admin-panel admin-panel--categories">
      <header className="admin-panel__header">
        <h2>Categorias</h2>
        <button className="admin-icon-btn" onClick={onAdd} aria-label="Nova categoria">
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
        {categories.map((c) => (
          <div
            key={c.id}
            className={`admin-category-row ${selectedId === c.id ? 'admin-category-row--active' : ''}`}
          >
            <button className="admin-category-row__label" onClick={() => onSelect(c.id)}>
              <span>{c.nome}</span>
              <span className="admin-category-row__count">{itemCountByCategory[c.id] ?? 0}</span>
            </button>
            <div className="admin-category-row__actions">
              <button
                className="admin-icon-btn admin-icon-btn--sm"
                onClick={() => onEdit(c)}
                aria-label={`Editar ${c.nome}`}
              >
                <Pencil size={14} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--sm admin-icon-btn--danger"
                onClick={() => onDelete(c)}
                aria-label={`Excluir ${c.nome}`}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        ))}
        {categories.length === 0 && <p className="admin-panel__empty">Nenhuma categoria ainda.</p>}
      </div>
    </section>
  )
}
