import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Fornecedor, Imposto, Insumo, PedidoCompraStatus, PedidoCompraWithItens } from '@shared/types'
import { formatCHF } from '@shared/format'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import { valorUnitarioComImposto } from '../estoqueCalc'
import type { PedidoCompraInput, PedidoCompraItemInput } from '../hooks/useComprasAdmin'

interface Props {
  pedido: PedidoCompraWithItens | null
  fornecedores: Fornecedor[]
  insumos: Insumo[]
  impostos: Imposto[]
  saldoPorInsumo: Record<string, number>
  onClose: () => void
  onSave: (input: PedidoCompraInput, itens: PedidoCompraItemInput[]) => Promise<void>
}

export default function CompraFormModal({ pedido, fornecedores, insumos, impostos, saldoPorInsumo, onClose, onSave }: Props) {
  const [fornecedorId, setFornecedorId] = useState(pedido?.fornecedor_id ?? fornecedores[0]?.id ?? '')
  const [status, setStatus] = useState<PedidoCompraStatus>(pedido?.status ?? 'rascunho')
  const [observacoes, setObservacoes] = useState(pedido?.observacoes ?? '')
  const [itens, setItens] = useState<PedidoCompraItemInput[]>(
    pedido?.itens.map((it) => ({ insumo_id: it.insumo_id, quantidade: it.quantidade, valor_unitario: it.valor_unitario })) ??
      [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addRow() {
    const used = new Set(itens.map((r) => r.insumo_id))
    const next = insumos.find((i) => !used.has(i.id))
    if (!next) return
    setItens((prev) => [...prev, { insumo_id: next.id, quantidade: 0, valor_unitario: next.valor_unitario_padrao }])
  }

  function updateRow(idx: number, patch: Partial<PedidoCompraItemInput>) {
    setItens((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r
        // Trocar de insumo troca também o preço sugerido, a menos que a
        // pessoa já tenha digitado um valor manualmente nesta linha.
        if (patch.insumo_id && patch.insumo_id !== r.insumo_id && r.valor_unitario === insumos.find((x) => x.id === r.insumo_id)?.valor_unitario_padrao) {
          const novoInsumo = insumos.find((x) => x.id === patch.insumo_id)
          return { ...r, ...patch, valor_unitario: novoInsumo?.valor_unitario_padrao ?? null }
        }
        return { ...r, ...patch }
      }),
    )
  }

  function removeRow(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fornecedorId) return
    if (itens.some((r) => !r.insumo_id || !(r.quantidade > 0))) {
      setError('Toda linha precisa de um insumo e uma quantidade maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({ fornecedor_id: fornecedorId, status, observacoes: observacoes.trim() || null }, itens)
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
          <h2>{pedido ? 'Editar pedido de compra' : 'Novo pedido de compra'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form admin-form--scroll" onSubmit={handleSubmit}>
          <label className="admin-form__field">
            <span>Fornecedor</span>
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} required>
              {fornecedores.length === 0 && <option value="">Nenhum fornecedor cadastrado</option>}
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form__field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as PedidoCompraStatus)}>
              <option value="rascunho">Rascunho</option>
              <option value="aguardando_recebimento">Aguardando recebimento (já confirmado com o fornecedor)</option>
            </select>
            <p className="admin-form__hint">
              "Recebido" só se marca na lista, ao confirmar a entrega — isso é o que dá entrada no estoque.
            </p>
          </label>

          <div className="admin-form__field">
            <span>Itens</span>
            {insumos.length === 0 && (
              <p className="admin-form__hint">Nenhum insumo cadastrado ainda — cadastre em Estoque → Insumos.</p>
            )}
            {insumos.length > 0 && (
              <div className="admin-composition-list">
                {itens.map((row, idx) => {
                  const insumo = insumos.find((i) => i.id === row.insumo_id)
                  const valorComImposto = row.valor_unitario
                    ? valorUnitarioComImposto(row.valor_unitario, row.insumo_id, impostos)
                    : null
                  const temImposto = valorComImposto != null && row.valor_unitario != null && valorComImposto !== row.valor_unitario
                  const saldoAtual = saldoPorInsumo[row.insumo_id] ?? 0
                  const saldoAposCompra = saldoAtual + (row.quantidade || 0)
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
                        <input
                          type="number"
                          min={0}
                          step="0.001"
                          value={row.quantidade || ''}
                          onChange={(e) => updateRow(idx, { quantidade: Number(e.target.value) })}
                          placeholder="Qtd."
                        />
                        <span>{insumo ? UNIDADE_LABEL[insumo.unidade] : ''}</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.valor_unitario ?? ''}
                          onChange={(e) =>
                            updateRow(idx, { valor_unitario: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          placeholder="CHF/un."
                        />
                        <span>CHF</span>
                        <button
                          type="button"
                          className="admin-composition-list__remove"
                          onClick={() => removeRow(idx)}
                          aria-label="Remover item"
                        >
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      </div>
                      {temImposto && (
                        <p className="admin-form__hint">Com imposto: {formatCHF(valorComImposto)}/un.</p>
                      )}
                      {insumo?.estoque_maximo != null && row.quantidade > 0 && (
                        <p className="admin-form__hint">
                          Estoque atual: {saldoAtual} {UNIDADE_LABEL[insumo.unidade]}. Com esta compra vai para{' '}
                          {saldoAposCompra} / {insumo.estoque_maximo} {UNIDADE_LABEL[insumo.unidade]} (
                          {Math.min(100, Math.round((saldoAposCompra / insumo.estoque_maximo) * 100))}%
                          {saldoAposCompra > insumo.estoque_maximo ? ' — acima do máximo' : ''})
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {insumos.length > itens.length && (
              <button type="button" className="btn btn-outline" onClick={addRow}>
                + Adicionar item
              </button>
            )}
            {itens.length > 0 && itens.some((r) => r.valor_unitario) && (
              <p className="admin-form__hint">
                Total com imposto:{' '}
                {formatCHF(
                  itens.reduce(
                    (soma, r) => soma + valorUnitarioComImposto(r.valor_unitario ?? 0, r.insumo_id, impostos) * r.quantidade,
                    0,
                  ),
                )}
              </p>
            )}
          </div>

          <label className="admin-form__field">
            <span>Observações</span>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </label>

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar pedido'}
          </button>
        </form>
      </div>
    </div>
  )
}
