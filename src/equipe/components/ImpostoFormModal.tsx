import { useState } from 'react'
import { X } from 'lucide-react'
import type { Imposto, ImpostoTipo, Insumo } from '@shared/types'
import type { ImpostoInput } from '../hooks/useImpostoAdmin'

interface Props {
  imposto: Imposto | null
  insumos: Insumo[]
  onClose: () => void
  onSave: (input: ImpostoInput) => Promise<void>
}

export default function ImpostoFormModal({ imposto, insumos, onClose, onSave }: Props) {
  const [nome, setNome] = useState(imposto?.nome ?? '')
  const [tipo, setTipo] = useState<ImpostoTipo>(imposto?.tipo ?? 'percentual')
  const [valor, setValor] = useState(imposto?.valor ?? 0)
  const [insumoId, setInsumoId] = useState(imposto?.insumo_id ?? '')
  const [ativo, setAtivo] = useState(imposto?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !(valor > 0)) {
      setError('Informe um nome e um valor maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ nome: nome.trim(), tipo, valor, insumo_id: insumoId || null, ativo })
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
          <h2>{imposto ? 'Editar imposto' : 'Novo imposto'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Taxa de importação" required />
          </label>

          <div className="admin-form__field">
            <span>Como é calculado</span>
            <div className="tip-type-choice">
              <button
                type="button"
                className={`tip-type-choice__item ${tipo === 'percentual' ? 'tip-type-choice__item--active' : ''}`}
                onClick={() => setTipo('percentual')}
              >
                <strong>Percentual</strong>
                <small>% sobre o valor unitário</small>
              </button>
              <button
                type="button"
                className={`tip-type-choice__item ${tipo === 'fixo' ? 'tip-type-choice__item--active' : ''}`}
                onClick={() => setTipo('fixo')}
              >
                <strong>Valor fixo</strong>
                <small>Por unidade comprada</small>
              </button>
            </div>
          </div>

          <label className="admin-form__field">
            <span>{tipo === 'percentual' ? 'Porcentagem (%)' : 'Valor (CHF) por unidade'}</span>
            <input
              type="number"
              min={0}
              step={tipo === 'percentual' ? 0.5 : 0.01}
              value={valor || ''}
              onChange={(e) => setValor(Number(e.target.value))}
              required
            />
          </label>

          <label className="admin-form__field">
            <span>Insumo vinculado (opcional)</span>
            <select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
              <option value="">Nenhum — só registro</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
            <p className="admin-form__hint">
              Quando vinculado a um insumo, este imposto entra automaticamente no custo de qualquer compra desse
              insumo.
            </p>
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
