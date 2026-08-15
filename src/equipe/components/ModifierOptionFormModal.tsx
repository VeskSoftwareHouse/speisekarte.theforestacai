import { useState } from 'react'
import { X } from 'lucide-react'
import type { Modifier, ModifierOption } from '@shared/types'
import CurrencyInput from '@shared/components/CurrencyInput'
import { translationsFor } from '../autoTranslate'
import type { ModifierOptionInput } from '../hooks/useModifierAdmin'

interface Props {
  option: ModifierOption | null
  groups: Modifier[]
  defaultGroupId: string | null
  onClose: () => void
  onSave: (input: ModifierOptionInput) => Promise<void>
}

export default function ModifierOptionFormModal({ option, groups, defaultGroupId, onClose, onSave }: Props) {
  const [nome, setNome] = useState(option?.nome ?? '')
  const [modifierId, setModifierId] = useState(option?.modifier_id ?? defaultGroupId ?? groups[0]?.id ?? '')
  const [precoAdicional, setPrecoAdicional] = useState(option?.preco_adicional ?? 0)
  const [ordem, setOrdem] = useState(option?.ordem ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !modifierId) return
    setSaving(true)
    setError(null)
    try {
      const { nome_i18n } = await translationsFor({ nome }, option)
      await onSave({
        nome: nome.trim(),
        nome_i18n,
        modifier_id: modifierId,
        preco_adicional: precoAdicional,
        ordem,
      })
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
          <h2>{option ? 'Editar adicional' : 'Novo adicional'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome (alemão)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Morango" required />
          </label>

          <p className="admin-form__hint">
            As traduções do nome são geradas automaticamente ao salvar.
          </p>

          <label className="admin-form__field">
            <span>Categoria de adicionais</span>
            <select value={modifierId} onChange={(e) => setModifierId(e.target.value)} required>
              {groups.length === 0 && <option value="">Nenhuma categoria cadastrada</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-form__row">
            <label className="admin-form__field">
              <span>Preço adicional (CHF)</span>
              <CurrencyInput value={precoAdicional} onChange={setPrecoAdicional} />
            </label>
            <label className="admin-form__field admin-form__field--sm">
              <span>Ordem</span>
              <input type="number" min={0} value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
            </label>
          </div>

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar adicional'}
          </button>
        </form>
      </div>
    </div>
  )
}
