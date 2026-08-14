import { useState } from 'react'
import { X } from 'lucide-react'
import type { Category } from '@shared/types'
import type { CategoryInput } from '../hooks/useMenuAdmin'

const TRANSLATION_LANGS: { code: string; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'it', label: 'IT' },
  { code: 'en', label: 'EN' },
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
]

interface Props {
  category: Category | null
  onClose: () => void
  onSave: (input: CategoryInput) => Promise<void>
}

export default function CategoryFormModal({ category, onClose, onSave }: Props) {
  const [nome, setNome] = useState(category?.nome ?? '')
  const [nomeI18n, setNomeI18n] = useState<Record<string, string>>(category?.nome_i18n ?? {})
  const [activeLang, setActiveLang] = useState(TRANSLATION_LANGS[0].code)
  const [ordem, setOrdem] = useState(category?.ordem ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      const cleanedI18n = Object.fromEntries(Object.entries(nomeI18n).filter(([, v]) => v.trim()))
      await onSave({ nome: nome.trim(), nome_i18n: cleanedI18n, ordem })
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

          <div className="admin-form__field">
            <span>Traduções do nome</span>
            <div className="admin-lang-tabs">
              {TRANSLATION_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`admin-lang-tab ${activeLang === l.code ? 'admin-lang-tab--active' : ''} ${
                    nomeI18n[l.code]?.trim() ? 'admin-lang-tab--filled' : ''
                  }`}
                  onClick={() => setActiveLang(l.code)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <input
              value={nomeI18n[activeLang] ?? ''}
              onChange={(e) => setNomeI18n((prev) => ({ ...prev, [activeLang]: e.target.value }))}
              placeholder="Deixe em branco para usar o alemão"
            />
          </div>

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
