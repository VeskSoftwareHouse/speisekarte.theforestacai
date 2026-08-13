import { Plus, Pencil, Trash2, ImageOff } from 'lucide-react'
import type { Category, MenuItem } from '@shared/types'

function formatCHF(value: number): string {
  return `CHF ${value.toFixed(2).replace('.', ',')}`
}

interface Props {
  products: MenuItem[]
  categoriesById: Record<string, Category>
  onAdd: () => void
  onEdit: (product: MenuItem) => void
  onDelete: (product: MenuItem) => void
  onToggleAvailable: (product: MenuItem) => void
}

export default function ProductPanel({
  products,
  categoriesById,
  onAdd,
  onEdit,
  onDelete,
  onToggleAvailable,
}: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Produtos</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo produto
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {products.length === 0 && <p className="admin-panel__empty">Nenhum produto nesta categoria.</p>}
        {products.map((p) => (
          <article key={p.id} className={`admin-product-row ${!p.disponivel ? 'admin-product-row--off' : ''}`}>
            <div className="admin-product-row__thumb">
              {p.foto_url ? <img src={p.foto_url} alt="" /> : <ImageOff size={20} strokeWidth={1.5} aria-hidden />}
            </div>
            <div className="admin-product-row__info">
              <div className="admin-product-row__title">
                <strong>{p.nome}</strong>
                <span className="admin-product-row__category">{categoriesById[p.categoria_id]?.nome ?? '—'}</span>
              </div>
              {p.descricao && <p className="admin-product-row__desc">{p.descricao}</p>}
            </div>
            <span className="admin-product-row__price">{formatCHF(p.preco)}</span>
            <label className="admin-toggle">
              <input type="checkbox" checked={p.disponivel} onChange={() => onToggleAvailable(p)} />
              <span className="admin-toggle__track">
                <span className="admin-toggle__thumb" />
              </span>
            </label>
            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(p)} aria-label={`Editar ${p.nome}`}>
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(p)}
                aria-label={`Excluir ${p.nome}`}
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
