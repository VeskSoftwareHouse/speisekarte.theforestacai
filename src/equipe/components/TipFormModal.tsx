import { useState } from 'react'
import { X } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { tipAmountFor, type TipOption, type TipTipo } from '@shared/types'
import CurrencyInput from '@shared/components/CurrencyInput'
import type { TipOptionInput } from '../hooks/useTipAdmin'

/** Pedido de referência da prévia, para a porcentagem virar francos na tela. */
const EXEMPLO_SUBTOTAL = 30

interface Props {
  tip: TipOption | null
  /** Para sugerir a próxima posição na fila quando é uma opção nova. */
  proximaOrdem: number
  onClose: () => void
  onSave: (input: TipOptionInput) => Promise<void>
}

export default function TipFormModal({ tip, proximaOrdem, onClose, onSave }: Props) {
  const [tipo, setTipo] = useState<TipTipo>(tip?.tipo ?? 'fixo')
  const [valor, setValor] = useState(tip?.valor ?? 0)
  const [ordem, setOrdem] = useState(tip?.ordem ?? proximaOrdem)
  const [ativo, setAtivo] = useState(tip?.ativo ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!(valor > 0)) {
      setError('O valor precisa ser maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ tipo, valor, ordem, ativo })
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
          <h2>{tip ? 'Editar gorjeta' : 'Nova gorjeta'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form__field">
            <span>Como é calculada</span>
            <div className="tip-type-choice">
              <button
                type="button"
                className={`tip-type-choice__item ${tipo === 'fixo' ? 'tip-type-choice__item--active' : ''}`}
                onClick={() => setTipo('fixo')}
              >
                <strong>Valor fixo</strong>
                <small>O mesmo em qualquer pedido</small>
              </button>
              <button
                type="button"
                className={`tip-type-choice__item ${tipo === 'percentual' ? 'tip-type-choice__item--active' : ''}`}
                onClick={() => setTipo('percentual')}
              >
                <strong>Percentual</strong>
                <small>Acompanha o tamanho do pedido</small>
              </button>
            </div>
          </div>

          {tipo === 'fixo' ? (
            <label className="admin-form__field">
              <span>Valor em francos</span>
              <CurrencyInput value={valor} onChange={setValor} />
            </label>
          ) : (
            <label className="admin-form__field">
              <span>Porcentagem do pedido</span>
              <div className="tip-percent-input">
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={valor || ''}
                  onChange={(e) => setValor(Number(e.target.value))}
                  placeholder="10"
                  required
                />
                <span>%</span>
              </div>
            </label>
          )}

          {/* A prévia existe porque "10%" não diz nada sozinho: o que a equipe
              precisa ver é quanto isso vira no balcão. */}
          {valor > 0 && (
            <p className="admin-form__hint">
              {tipo === 'fixo'
                ? `O cliente vê o botão “${formatCHF(valor)}”.`
                : `Num pedido de ${formatCHF(EXEMPLO_SUBTOTAL)}, o cliente vê “${formatCHF(
                    tipAmountFor({ tipo, valor }, EXEMPLO_SUBTOTAL),
                  )}”.`}
            </p>
          )}

          <label className="admin-form__field">
            <span>Posição na fila</span>
            <input
              type="number"
              min={0}
              value={ordem}
              onChange={(e) => setOrdem(Number(e.target.value))}
              required
            />
          </label>

          <label className="admin-form__checkbox">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span>Mostrar no totem</span>
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
