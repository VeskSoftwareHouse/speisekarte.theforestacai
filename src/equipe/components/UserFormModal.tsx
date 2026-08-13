import { useState } from 'react'
import { X } from 'lucide-react'
import type { AdminUser, UserInput } from '../hooks/useUserAdmin'

interface Props {
  user: AdminUser | null
  onClose: () => void
  onSave: (input: UserInput) => Promise<void>
}

export default function UserFormModal({ user, onClose, onSave }: Props) {
  const [nome, setNome] = useState(user?.nome ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || (!user && !password)) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ email: email.trim(), nome: nome.trim(), password: password || undefined })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--sm" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal__header">
          <h2>{user ? 'Editar usuário' : 'Novo usuário'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Maria" />
          </label>

          <label className="admin-form__field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@forestacai.ch"
              required
            />
          </label>

          <label className="admin-form__field">
            <span>{user ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required={!user}
            />
          </label>

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar usuário'}
          </button>
        </form>
      </div>
    </div>
  )
}
