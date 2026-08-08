import { formatCHF } from '@shared/format'
import type { CartItem } from '../types'
import { cartItemTotal } from '../types'

interface Props {
  items: CartItem[]
  sending: boolean
  onChangeQuantity: (cartId: string, delta: number) => void
  onRemove: (cartId: string) => void
  onSubmit: () => void
}

export default function CartPanel({ items, sending, onChangeQuantity, onRemove, onSubmit }: Props) {
  const total = items.reduce((sum, i) => sum + cartItemTotal(i), 0)
  const count = items.reduce((sum, i) => sum + i.quantidade, 0)

  return (
    <aside className="cart-panel">
      <header className="cart-panel__header">
        <span aria-hidden>🛍️</span>
        Meu pedido
        {count > 0 && <span className="cart-panel__count">{count}</span>}
      </header>

      {items.length === 0 ? (
        <p className="cart-panel__empty">
          Seu carrinho está vazio.
          <br />
          Toque em um item para adicionar.
        </p>
      ) : (
        <ul className="cart-panel__list">
          {items.map((item) => (
            <li key={item.cartId} className="cart-panel__item">
              <div className="cart-panel__thumb">
                {item.menuItem.foto_url ? (
                  <img src={item.menuItem.foto_url} alt="" />
                ) : (
                  <span aria-hidden>🍇</span>
                )}
              </div>
              <div className="cart-panel__info">
                <div className="cart-panel__name-row">
                  <span className="cart-panel__name">{item.menuItem.nome}</span>
                  <button
                    className="cart-panel__remove"
                    onClick={() => onRemove(item.cartId)}
                    aria-label="Remover item"
                  >
                    ✕
                  </button>
                </div>
                {item.selectedOptions.length > 0 && (
                  <p className="cart-panel__mods">{item.selectedOptions.map((o) => o.option_nome).join(', ')}</p>
                )}
                {item.observacoes && <p className="cart-panel__obs">Obs: {item.observacoes}</p>}
                <div className="cart-panel__row">
                  <div className="stepper stepper--sm">
                    <button
                      className="stepper__btn"
                      onClick={() => onChangeQuantity(item.cartId, -1)}
                      aria-label="Diminuir quantidade"
                    >
                      −
                    </button>
                    <span className="stepper__value">{item.quantidade}</span>
                    <button
                      className="stepper__btn"
                      onClick={() => onChangeQuantity(item.cartId, 1)}
                      aria-label="Aumentar quantidade"
                    >
                      +
                    </button>
                  </div>
                  <span className="cart-panel__price">{formatCHF(cartItemTotal(item))}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="cart-panel__footer">
        <div className="cart-panel__total">
          <span>Total</span>
          <strong>{formatCHF(total)}</strong>
        </div>
        <button className="btn btn-primary btn-block" disabled={items.length === 0 || sending} onClick={onSubmit}>
          {sending ? 'Enviando…' : 'Finalizar pedido →'}
        </button>
      </footer>
    </aside>
  )
}
