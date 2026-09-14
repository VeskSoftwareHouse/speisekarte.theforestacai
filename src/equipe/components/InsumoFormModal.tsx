import { useState } from 'react'
import { X } from 'lucide-react'
import type { Insumo, Unidade } from '@shared/types'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import type { InsumoInput } from '../hooks/useInsumoAdmin'

const UNIDADES: { value: Unidade; label: string }[] = (['kg', 'g', 'l', 'ml', 'unidade'] as const).map((value) => ({
  value,
  label: UNIDADE_LABEL[value][0].toUpperCase() + UNIDADE_LABEL[value].slice(1),
}))

interface Props {
  insumo: Insumo | null
  proximaOrdem: number
  onClose: () => void
  onSave: (input: InsumoInput) => Promise<void>
}

export default function InsumoFormModal({ insumo, proximaOrdem, onClose, onSave }: Props) {
  const [nome, setNome] = useState(insumo?.nome ?? '')
  const [unidade, setUnidade] = useState<Unidade>(insumo?.unidade ?? 'g')
  const [estoqueMinimo, setEstoqueMinimo] = useState(insumo?.estoque_minimo ?? '')
  const [gramasPorLitro, setGramasPorLitro] = useState(insumo?.gramas_por_litro ?? '')
  const [ordem, setOrdem] = useState(insumo?.ordem ?? proximaOrdem)
  const [ativo, setAtivo] = useState(insumo?.ativo ?? true)
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
        unidade,
        estoque_minimo: estoqueMinimo === '' ? null : Number(estoqueMinimo),
        // Só faz sentido controlando em volume — trocar pra kg/g/unidade
        // descarta a densidade em vez de deixar um valor órfão no banco.
        gramas_por_litro: (unidade === 'l' || unidade === 'ml') && gramasPorLitro !== '' ? Number(gramasPorLitro) : null,
        ativo,
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
          <h2>{insumo ? 'Editar insumo' : 'Novo insumo'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Nome</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Açaí" required />
          </label>

          <div className="admin-form__row">
            <label className="admin-form__field">
              <span>Unidade de controle</span>
              <select value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)}>
                {UNIDADES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-form__field admin-form__field--sm">
              <span>Ordem</span>
              <input type="number" min={0} value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
            </label>
          </div>

          {(unidade === 'l' || unidade === 'ml') && (
            <label className="admin-form__field">
              <span>Peso de 1 litro em gramas (opcional)</span>
              <input
                type="number"
                min={0}
                step="1"
                value={gramasPorLitro}
                onChange={(e) => setGramasPorLitro(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 1030"
              />
              <p className="admin-form__hint">
                Pese 1 litro deste insumo numa balança. Informando isto, a composição dos produtos passa a aceitar a
                quantidade em gramas em vez de {unidade === 'l' ? 'litros' : 'mililitros'} — o estoque continua sendo
                controlado em {unidade === 'l' ? 'litros' : 'mililitros'} normalmente.
              </p>
            </label>
          )}

          <label className="admin-form__field">
            <span>Alerta de saldo baixo (opcional)</span>
            <input
              type="number"
              min={0}
              step="0.001"
              value={estoqueMinimo}
              onChange={(e) => setEstoqueMinimo(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ex: 2"
            />
            <p className="admin-form__hint">Abaixo deste saldo, o insumo aparece com alerta no painel de estoque.</p>
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
