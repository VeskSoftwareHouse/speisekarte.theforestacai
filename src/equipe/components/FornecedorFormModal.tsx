import { useState } from 'react'
import { X } from 'lucide-react'
import type { Fornecedor } from '@shared/types'
import type { FornecedorInput } from '../hooks/useFornecedorAdmin'

interface Props {
  fornecedor: Fornecedor | null
  onClose: () => void
  onSave: (input: FornecedorInput) => Promise<void>
}

export default function FornecedorFormModal({ fornecedor, onClose, onSave }: Props) {
  const [nome, setNome] = useState(fornecedor?.nome ?? '')
  const [contato, setContato] = useState(fornecedor?.contato ?? '')
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? '')
  const [email, setEmail] = useState(fornecedor?.email ?? '')
  const [observacoes, setObservacoes] = useState(fornecedor?.observacoes ?? '')
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        nome: nome.trim(),
        contato: contato.trim() || null,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        observacoes: observacoes.trim() || null,
        ativo,
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
          <h2>{fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Hortifruti Central" required />
          </label>

          <label className="admin-form__field">
            <span>Contato (pessoa)</span>
            <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Ex: João" />
          </label>

          <div className="admin-form__row">
            <label className="admin-form__field">
              <span>Telefone</span>
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+41 ..." />
            </label>
            <label className="admin-form__field">
              <span>E-mail</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>

          <label className="admin-form__field">
            <span>Observações</span>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </label>

          <label className="admin-form__checkbox">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span>Ativo</span>
          </label>

          {error && <p className="admin-form__error">{error}</p>}

          <footer className="admin-modal__footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
