import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, UserRound } from 'lucide-react'
import type { AdminUser } from '../hooks/useUserAdmin'
import AdminSearchInput from './AdminSearchInput'

function formatDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props {
  users: AdminUser[]
  currentUserId: string
  onAdd: () => void
  onEdit: (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
}

export default function UsersPanel({ users, currentUserId, onAdd, onEdit, onDelete }: Props) {
  const [query, setQuery] = useState('')

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
  }, [users, query])

  return (
    <section className="admin-panel admin-panel--users">
      <header className="admin-panel__header">
        <h2>Usuários</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo usuário
        </button>
      </header>

      <AdminSearchInput value={query} onChange={setQuery} placeholder="Buscar usuário…" />

      <div className="admin-panel__body admin-user-list">
        {filteredUsers.length === 0 && (
          <p className="admin-panel__empty">{query ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.'}</p>
        )}
        {filteredUsers.map((u) => (
          <article key={u.id} className="admin-user-row">
            <div className="admin-user-row__avatar">
              <UserRound size={20} strokeWidth={1.5} aria-hidden />
            </div>
            <div className="admin-user-row__info">
              <div className="admin-user-row__title">
                <strong>{u.nome || u.email}</strong>
                {u.id === currentUserId && <span className="admin-user-row__you">você</span>}
              </div>
              {u.nome && <span className="admin-user-row__email">{u.email}</span>}
              <span className="admin-user-row__meta">Último acesso: {formatDate(u.last_sign_in_at)}</span>
            </div>
            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(u)} aria-label={`Editar ${u.email}`}>
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(u)}
                aria-label={`Excluir ${u.email}`}
                disabled={u.id === currentUserId}
                title={u.id === currentUserId ? 'Você não pode excluir seu próprio usuário' : undefined}
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
