import { Plus, Trash2 } from 'lucide-react'
import type { InventarioWithItens } from '@shared/types'

interface Props {
  inventarios: InventarioWithItens[]
  onAdd: () => void
  onDelete: (inventario: InventarioWithItens) => void
}

export default function InventarioPanel({ inventarios, onAdd, onDelete }: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Inventário</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Nova contagem
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {inventarios.length === 0 && (
          <p className="admin-panel__empty">
            Nenhuma contagem feita ainda. Uma contagem compara o saldo do sistema com o que a equipe encontra
            fisicamente, e ajusta o estoque na hora.
          </p>
        )}

        {inventarios.map((inv) => {
          const divergencias = inv.itens.filter((it) => it.saldo_contado !== it.saldo_sistema).length
          return (
            <article key={inv.id} className="admin-product-row">
              <div className="admin-product-row__info">
                <div className="admin-product-row__title">
                  <strong>{new Date(inv.criado_em).toLocaleString('pt-BR')}</strong>
                  {divergencias > 0 && (
                    <span className="admin-product-row__category">
                      {divergencias} {divergencias === 1 ? 'divergência' : 'divergências'}
                    </span>
                  )}
                </div>
                <p className="admin-product-row__desc">
                  {inv.itens.length} {inv.itens.length === 1 ? 'insumo contado' : 'insumos contados'}
                  {inv.observacoes ? ` · ${inv.observacoes}` : ''}
                </p>
              </div>

              <div className="admin-product-row__actions">
                <button
                  className="admin-icon-btn admin-icon-btn--danger"
                  onClick={() => onDelete(inv)}
                  aria-label="Excluir inventário"
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
