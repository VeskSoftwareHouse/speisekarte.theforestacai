import { Plus, Pencil, Trash2 } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { tipAmountFor, type TipOption } from '@shared/types'

/** Pedido de referência para mostrar quanto uma porcentagem daria em francos. */
const EXEMPLO_SUBTOTAL = 30

interface Props {
  tips: TipOption[]
  onAdd: () => void
  onEdit: (tip: TipOption) => void
  onDelete: (tip: TipOption) => void
  onToggle: (tip: TipOption, ativo: boolean) => void
}

export default function TipPanel({ tips, onAdd, onEdit, onDelete, onToggle }: Props) {
  const ativas = tips.filter((tip) => tip.ativo)

  return (
    <section className="admin-panel admin-panel--products">
      <header className="admin-panel__header">
        <h2>Gorjetas</h2>
        <button className="btn btn-primary admin-add-btn" onClick={onAdd}>
          <Plus size={18} strokeWidth={2.5} />
          Nova opção
        </button>
      </header>

      <p className="admin-panel__hint">
        As opções que o cliente vê ao fechar o pedido, nesta ordem. <strong>&ldquo;Sem gorjeta&rdquo; aparece
        sempre</strong> e não precisa ser cadastrada — o cliente nunca fica sem a saída de não deixar nada.
      </p>

      <div className="admin-panel__body admin-product-list">
        {tips.length === 0 && (
          <p className="admin-panel__empty">
            Nenhuma opção cadastrada. O totem vai oferecer só &ldquo;Sem gorjeta&rdquo;.
          </p>
        )}

        {tips.map((tip) => (
          <article key={tip.id} className={`admin-product-row ${tip.ativo ? '' : 'admin-product-row--off'}`}>
            <div className="admin-product-row__info">
              <div className="admin-product-row__title">
                <strong>
                  {tip.tipo === 'fixo' ? formatCHF(tip.valor) : `${String(tip.valor).replace('.', ',')}%`}
                </strong>
                <span className="admin-product-row__category">{tip.tipo === 'fixo' ? 'Valor fixo' : 'Percentual'}</span>
              </div>
              <p className="admin-product-row__desc">
                {tip.tipo === 'fixo'
                  ? 'O mesmo valor em qualquer pedido.'
                  : `Acompanha o tamanho do pedido: ${formatCHF(
                      tipAmountFor(tip, EXEMPLO_SUBTOTAL),
                    )} num pedido de ${formatCHF(EXEMPLO_SUBTOTAL)}.`}
              </p>
            </div>

            <label className="admin-toggle" title={tip.ativo ? 'Aparece no totem' : 'Escondida do totem'}>
              <input type="checkbox" checked={tip.ativo} onChange={(e) => onToggle(tip, e.target.checked)} />
              <span className="admin-toggle__track">
                <span className="admin-toggle__thumb" />
              </span>
            </label>

            <div className="admin-product-row__actions">
              <button className="admin-icon-btn" onClick={() => onEdit(tip)} aria-label="Editar opção de gorjeta">
                <Pencil size={16} strokeWidth={2} />
              </button>
              <button
                className="admin-icon-btn admin-icon-btn--danger"
                onClick={() => onDelete(tip)}
                aria-label="Excluir opção de gorjeta"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {/* Cada opção é uma pílula na tela do cliente; passando de umas cinco elas
          começam a quebrar em várias linhas e a decisão fica mais lenta. */}
      {ativas.length > 5 && (
        <p className="admin-panel__hint admin-panel__hint--warn">
          {ativas.length} opções ativas. No totem elas viram botões lado a lado — acima de cinco a lista quebra em
          várias linhas e o cliente demora mais para escolher.
        </p>
      )}
    </section>
  )
}
