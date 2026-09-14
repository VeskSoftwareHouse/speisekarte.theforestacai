import { useState } from 'react'
import { X } from 'lucide-react'
import type { Insumo } from '@shared/types'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import type { MovimentoManualInput } from '../hooks/useEstoqueMovimentos'

interface Props {
  insumos: Insumo[]
  onClose: () => void
  onSave: (input: MovimentoManualInput) => Promise<void>
}

export default function MovimentacaoFormModal({ insumos, onClose, onSave }: Props) {
  const [insumoId, setInsumoId] = useState(insumos[0]?.id ?? '')
  const [direcao, setDirecao] = useState<'entrada' | 'saida'>('entrada')
  const [quantidade, setQuantidade] = useState<number | ''>('')
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const insumo = insumos.find((i) => i.id === insumoId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!insumoId || !(Number(quantidade) > 0)) {
      setError('Escolha um insumo e uma quantidade maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ insumo_id: insumoId, direcao, quantidade: Number(quantidade), observacoes: observacoes.trim() || null })
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
          <h2>Novo lançamento manual</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form__field">
            <span>Direção</span>
            <div className="tip-type-choice">
              <button
                type="button"
                className={`tip-type-choice__item ${direcao === 'entrada' ? 'tip-type-choice__item--active' : ''}`}
                onClick={() => setDirecao('entrada')}
              >
                <strong>Entrada</strong>
                <small>Chegou mais estoque</small>
              </button>
              <button
                type="button"
                className={`tip-type-choice__item ${direcao === 'saida' ? 'tip-type-choice__item--active' : ''}`}
                onClick={() => setDirecao('saida')}
              >
                <strong>Saída</strong>
                <small>Consumo ou correção</small>
              </button>
            </div>
          </div>

          <label className="admin-form__field">
            <span>Insumo</span>
            <select value={insumoId} onChange={(e) => setInsumoId(e.target.value)} required>
              {insumos.length === 0 && <option value="">Nenhum insumo cadastrado</option>}
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form__field">
            <span>Quantidade {insumo ? `(${UNIDADE_LABEL[insumo.unidade]})` : ''}</span>
            <input
              type="number"
              min={0}
              step="0.001"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value === '' ? '' : Number(e.target.value))}
              required
            />
          </label>

          <label className="admin-form__field">
            <span>Observações</span>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Ex: correção de contagem, quebra, uso interno..."
            />
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
