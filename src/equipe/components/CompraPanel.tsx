import { Plus, Pencil, Trash2, PackageCheck, Ban } from 'lucide-react'
import type { Fornecedor, Imposto, PedidoCompraStatus, PedidoCompraWithItens } from '@shared/types'
import { formatCHF } from '@shared/format'
import { valorUnitarioComImposto } from '../estoqueCalc'

const STATUS_LABEL: Record<PedidoCompraStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_recebimento: 'Aguardando recebimento',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
}

interface Props {
  pedidos: PedidoCompraWithItens[]
  fornecedoresById: Record<string, Fornecedor>
  impostos: Imposto[]
  onAdd: () => void
  onEdit: (pedido: PedidoCompraWithItens) => void
  onReceive: (pedido: PedidoCompraWithItens) => void
  onCancel: (pedido: PedidoCompraWithItens) => void
  onDelete: (pedido: PedidoCompraWithItens) => void
}

export default function CompraPanel({
  pedidos,
  fornecedoresById,
  impostos,
  onAdd,
  onEdit,
  onReceive,
  onCancel,
  onDelete,
}: Props) {
  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Compras</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Novo pedido
        </button>
      </header>

      <div className="admin-panel__body admin-product-list">
        {pedidos.length === 0 && <p className="admin-panel__empty">Nenhum pedido de compra cadastrado.</p>}

        {pedidos.map((pedido) => {
          const total = pedido.itens.reduce(
            (sum, it) => sum + valorUnitarioComImposto(it.valor_unitario ?? 0, it.insumo_id, impostos) * it.quantidade,
            0,
          )
          const podeEditar = pedido.status === 'rascunho'
          const podeReceberOuCancelar = pedido.status === 'rascunho' || pedido.status === 'aguardando_recebimento'
          return (
            <article key={pedido.id} className="admin-product-row">
              <div className="admin-product-row__info">
                <div className="admin-product-row__title">
                  <strong>{fornecedoresById[pedido.fornecedor_id]?.nome ?? 'Fornecedor removido'}</strong>
                  <span className={`status-pill status-pill--${pedido.status}`}>{STATUS_LABEL[pedido.status]}</span>
                </div>
                <p className="admin-product-row__desc">
                  {pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}
                  {total > 0 && ` · ${formatCHF(total)}`}
                  {' · '}
                  {new Date(pedido.criado_em).toLocaleDateString('pt-BR')}
                </p>
              </div>

              <div className="admin-product-row__actions">
                {podeEditar && (
                  <button className="admin-icon-btn" onClick={() => onEdit(pedido)} aria-label="Editar pedido">
                    <Pencil size={16} strokeWidth={2} />
                  </button>
                )}
                {podeReceberOuCancelar && (
                  <button
                    className="admin-icon-btn"
                    onClick={() => onReceive(pedido)}
                    aria-label="Marcar como recebido"
                    title="Marcar como recebido (dá entrada no estoque)"
                  >
                    <PackageCheck size={16} strokeWidth={2} />
                  </button>
                )}
                {podeReceberOuCancelar && (
                  <button
                    className="admin-icon-btn"
                    onClick={() => onCancel(pedido)}
                    aria-label="Cancelar pedido"
                    title="Cancelar pedido"
                  >
                    <Ban size={16} strokeWidth={2} />
                  </button>
                )}
                <button
                  className="admin-icon-btn admin-icon-btn--danger"
                  onClick={() => onDelete(pedido)}
                  aria-label="Excluir pedido"
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
