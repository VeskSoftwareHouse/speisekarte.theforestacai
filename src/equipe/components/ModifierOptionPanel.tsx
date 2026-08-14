import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Modifier, ModifierOption } from '@shared/types'
import AdminSearchInput from './AdminSearchInput'

function formatCHF(value: number): string {
  return `CHF ${value.toFixed(2).replace('.', ',')}`
}

interface Props {
  options: ModifierOption[]
  groupsById: Record<string, Modifier>
  onAdd: () => void
  onEdit: (option: ModifierOption) => void
  onDelete: (option: ModifierOption) => void
}

export default function ModifierOptionPanel({ options, groupsById, onAdd, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState('')

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.nome.toLowerCase().includes(q))
  }, [options, query])

  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Adicionais</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo adicional
        </button>
      </header>

      <AdminSearchInput value={query} onChange={setQuery} placeholder="Buscar adicional…" />

      <div className="admin-panel__body admin-product-list">
        {filteredOptions.length === 0 && (
          <p className="admin-panel__empty">{query ? 'Nenhum adicional encontrado.' : 'Nenhum adicional nesta categoria.'}</p>
        )}
        {filteredOptions.map((o) => (
          <article key={o.id} className="admin-product-row">
            <div className="admin-product-row__info">
              <div className="admin-product-row__title">
                <strong>{o.nome}</strong>
                <span className="admin-product-row__category">{groupsById[o.modifier_id]?.nome ?? '—'}</span>
              </div>
            </div>
            <span className="admin-product-row__price">
              {o.preco_adicional > 0 ? `+${formatCHF(o.preco_adicional)}` : 'Sem custo'}
            </span>
            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(o)} aria-label={`Editar ${o.nome}`}>
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(o)}
                aria-label={`Excluir ${o.nome}`}
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
