import { useState } from 'react'
import { X } from 'lucide-react'
import type { Modifier } from '@shared/types'
import { translationsFor } from '../autoTranslate'
import type { ModifierGroupInput } from '../hooks/useModifierAdmin'

interface Props {
  group: Modifier | null
  onClose: () => void
  onSave: (input: ModifierGroupInput) => Promise<void>
}

export default function ModifierGroupFormModal({ group, onClose, onSave }: Props) {
  const [nome, setNome] = useState(group?.nome ?? '')
  const [tipo, setTipo] = useState<Modifier['tipo']>(group?.tipo ?? 'opcional')
  const [selecao, setSelecao] = useState<Modifier['selecao']>(group?.selecao ?? 'multipla')
  const contaParaLimite = group?.conta_para_limite ?? false
  const [maxSelecoes, setMaxSelecoes] = useState(group?.max_selecoes?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      const { nome_i18n } = await translationsFor({ nome }, group)
      const parsedMaxSelecoes = maxSelecoes.trim() ? Number(maxSelecoes) : null
      await onSave({
        nome: nome.trim(),
        nome_i18n,
        tipo,
        selecao,
        conta_para_limite: contaParaLimite,
        max_selecoes: parsedMaxSelecoes,
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
          <h2>{group ? 'Editar categoria de adicionais' : 'Nova categoria de adicionais'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome (alemão)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Frutas" required />
          </label>

          <p className="admin-form__hint">
            As traduções do nome são geradas automaticamente ao salvar.
          </p>

          <div className="admin-form__row">
            <label className="admin-form__field">
              <span>Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as Modifier['tipo'])}>
                <option value="opcional">Opcional</option>
                <option value="obrigatorio">Obrigatório</option>
              </select>
            </label>
            <label className="admin-form__field">
              <span>Seleção</span>
              <select value={selecao} onChange={(e) => setSelecao(e.target.value as Modifier['selecao'])}>
                <option value="multipla">Múltipla</option>
                <option value="unica">Única</option>
              </select>
            </label>
          </div>

          {selecao === 'multipla' && (
            <label className="admin-form__field">
              <span>Limite de adicionais da categoria</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={maxSelecoes}
                onChange={(e) => setMaxSelecoes(e.target.value)}
                placeholder="Sem limite"
              />
            </label>
          )}

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar categoria'}
          </button>
        </form>
      </div>
    </div>
  )
}
