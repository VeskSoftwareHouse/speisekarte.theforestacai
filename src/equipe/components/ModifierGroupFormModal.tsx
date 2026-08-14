import { useState } from 'react'
import { X } from 'lucide-react'
import type { Modifier } from '@shared/types'
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
  const [contaParaLimite, setContaParaLimite] = useState(group?.conta_para_limite ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ nome: nome.trim(), tipo, selecao, conta_para_limite: contaParaLimite })
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
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Frutas" required />
          </label>

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

          <label className="admin-form__checkbox">
            <input
              type="checkbox"
              checked={contaParaLimite}
              onChange={(e) => setContaParaLimite(e.target.checked)}
            />
            <span>Opções contam para o limite de ingredientes do produto</span>
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
