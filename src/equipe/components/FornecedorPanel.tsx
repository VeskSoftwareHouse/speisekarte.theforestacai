import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { Fornecedor } from '@shared/types'

interface Props {
  fornecedores: Fornecedor[]
  onAdd: () => void
  onEdit: (fornecedor: Fornecedor) => void
  onDelete: (fornecedor: Fornecedor) => void
}

export default function FornecedorPanel({ fornecedores, onAdd, onEdit, onDelete }: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Fornecedores</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo fornecedor
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {fornecedores.length === 0 && <p className="admin-panel__empty">Nenhum fornecedor cadastrado.</p>}

        {fornecedores.map((fornecedor) => (
          <article
            key={fornecedor.id}
            className={`admin-product-row ${fornecedor.ativo ? '' : 'admin-product-row--off'}`}
          >
            <div className="admin-product-row__info">
              <div className="admin-product-row__title">
                <strong>{fornecedor.nome}</strong>
                {!fornecedor.ativo && <span className="admin-product-row__category">Inativo</span>}
              </div>
              <p className="admin-product-row__desc">
                {[fornecedor.contato, fornecedor.telefone, fornecedor.email].filter(Boolean).join(' · ') ||
                  'Sem dados de contato'}
              </p>
            </div>

            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(fornecedor)} aria-label="Editar fornecedor">
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(fornecedor)}
                aria-label="Excluir fornecedor"
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
