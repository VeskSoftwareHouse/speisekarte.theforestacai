import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Insumo, MotivoPerda } from '@shared/types'
import { MOTIVO_PERDA_LABEL } from '@shared/types'
import type { InventarioItemInput } from '../hooks/useInventarioAdmin'

interface Row {
  insumo_id: string
  saldo_contado: number | ''
  motivo: MotivoPerda | ''
}

interface Props {
  insumos: Insumo[]
  saldoPorInsumo: Record<string, number>
  onClose: () => void
  onSave: (observacoes: string | null, itens: InventarioItemInput[]) => Promise<void>
}

const MOTIVOS = Object.entries(MOTIVO_PERDA_LABEL) as [MotivoPerda, string][]

export default function InventarioFormModal({ insumos, saldoPorInsumo, onClose, onSave }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addRow() {
    const used = new Set(rows.map((r) => r.insumo_id))
    const next = insumos.find((i) => !used.has(i.id))
    if (!next) return
    setRows((prev) => [...prev, { insumo_id: next.id, saldo_contado: '', motivo: '' }])
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rows.length === 0) return
    if (rows.some((r) => r.saldo_contado === '')) {
      setError('Informe a contagem de todo insumo adicionado.')
      return
    }
    const itens: InventarioItemInput[] = []
    for (const row of rows) {
      const saldoSistema = saldoPorInsumo[row.insumo_id] ?? 0
      const saldoContado = Number(row.saldo_contado)
      if (saldoContado < saldoSistema && !row.motivo) {
        setError('Insumos com contagem menor que o saldo do sistema precisam de um motivo.')
        return
      }
      itens.push({
        insumo_id: row.insumo_id,
        saldo_sistema: saldoSistema,
        saldo_contado: saldoContado,
        motivo: saldoContado < saldoSistema ? (row.motivo as MotivoPerda) : null,
      })
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(observacoes.trim() || null, itens)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal__header">
          <h2>Nova contagem de estoque</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form admin-form--scroll" onSubmit={handleSubmit}>
          <p className="admin-form__hint">
            Adicione os insumos que vai conferir. O saldo do sistema aparece pra comparar — ao salvar, toda diferença
            já ajusta o estoque na hora.
          </p>

          {insumos.length === 0 && (
            <p className="admin-form__hint">Nenhum insumo cadastrado ainda — cadastre em Estoque → Insumos.</p>
          )}

          {insumos.length > 0 && (
            <div className="admin-composition-list">
              {rows.map((row, idx) => {
                const insumo = insumos.find((i) => i.id === row.insumo_id)
                const saldoSistema = saldoPorInsumo[row.insumo_id] ?? 0
                const saldoContado = row.saldo_contado === '' ? null : Number(row.saldo_contado)
                const faltou = saldoContado != null && saldoContado < saldoSistema
                return (
                  <div key={idx} className="admin-inventario-row">
                    <div className="admin-composition-list__row">
                      <select value={row.insumo_id} onChange={(e) => updateRow(idx, { insumo_id: e.target.value })}>
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome}
                          </option>
                        ))}
                      </select>
                      <span>
                        Sistema: {saldoSistema} {insumo?.unidade}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={row.saldo_contado}
                        onChange={(e) =>
                          updateRow(idx, { saldo_contado: e.target.value === '' ? '' : Number(e.target.value) })
                        }
                        placeholder="Contagem"
                      />
                      <button
                        type="button"
                        className="admin-composition-list__remove"
                        onClick={() => removeRow(idx)}
                        aria-label="Remover da contagem"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    </div>
                    {faltou && (
                      <label className="admin-form__field admin-inventario-row__motivo">
                        <span>
                          Faltaram {(saldoSistema - (saldoContado ?? 0)).toFixed(3)} {insumo?.unidade} — motivo
                        </span>
                        <select value={row.motivo} onChange={(e) => updateRow(idx, { motivo: e.target.value as MotivoPerda })}>
                          <option value="">Selecione…</option>
                          {MOTIVOS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {insumos.length > rows.length && (
            <button type="button" className="btn btn-outline" onClick={addRow}>
              + Adicionar insumo à contagem
            </button>
          )}

          <label className="admin-form__field">
            <span>Observações</span>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </label>

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving || rows.length === 0}>
            {saving ? 'Salvando…' : 'Confirmar contagem e ajustar estoque'}
          </button>
        </form>
      </div>
    </div>
  )
}
