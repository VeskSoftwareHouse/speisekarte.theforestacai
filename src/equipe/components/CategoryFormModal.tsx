import { useState } from 'react'
import { X } from 'lucide-react'
import type { Category } from '@shared/types'
import { translationsFor } from '../autoTranslate'
import type { CategoryInput } from '../hooks/useMenuAdmin'

interface Props {
  category: Category | null
  accessToken: string
  onClose: () => void
  onSave: (input: CategoryInput) => Promise<void>
}

export default function CategoryFormModal({ category, accessToken, onClose, onSave }: Props) {
  const [nome, setNome] = useState(category?.nome ?? '')
  const [ordem, setOrdem] = useState(category?.ordem ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { nome_i18n } = await translationsFor({ nome }, category, accessToken)
      await onSave({ nome: nome.trim(), nome_i18n, ordem })
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
          <h2>{category ? 'Editar categoria' : 'Nova categoria'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome (alemão)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Bebidas" required />
          </label>

          <p className="admin-form__hint">
            As traduções do nome são geradas automaticamente ao salvar.
          </p>

          <label className="admin-form__field admin-form__field--sm">
            <span>Ordem de exibição</span>
            <input
              type="number"
              value={ordem}
              onChange={(e) => setOrdem(Number(e.target.value))}
              min={0}
            />
          </label>

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar categoria'}
          </button>
        </form>
      </div>
    </div>
  )
}
