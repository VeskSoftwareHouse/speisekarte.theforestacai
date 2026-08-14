import { useState } from 'react'
import { X } from 'lucide-react'
import type { Modifier } from '@shared/types'
import type { ModifierGroupInput } from '../hooks/useModifierAdmin'

const TRANSLATION_LANGS: { code: string; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'it', label: 'IT' },
  { code: 'en', label: 'EN' },
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
]

interface Props {
  group: Modifier | null
  onClose: () => void
  onSave: (input: ModifierGroupInput) => Promise<void>
}

export default function ModifierGroupFormModal({ group, onClose, onSave }: Props) {
  const [nome, setNome] = useState(group?.nome ?? '')
  const [nomeI18n, setNomeI18n] = useState<Record<string, string>>(group?.nome_i18n ?? {})
  const [activeLang, setActiveLang] = useState(TRANSLATION_LANGS[0].code)
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
      const cleanedI18n = Object.fromEntries(Object.entries(nomeI18n).filter(([, v]) => v.trim()))
      await onSave({ nome: nome.trim(), nome_i18n: cleanedI18n, tipo, selecao, conta_para_limite: contaParaLimite })
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
