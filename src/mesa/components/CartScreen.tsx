import { formatCHF } from '@shared/format'
import type { CartItem } from '../types'
import { cartItemTotal } from '../types'

interface Props {
  items: CartItem[]
  sending: boolean
  onBack: () => void
  onChangeQuantity: (cartId: string, delta: number) => void
  onRemove: (cartId: string) => void
  onSubmit: () => void
}

export default function CartScreen({ items, sending, onBack, onChangeQuantity, onRemove, onSubmit }: Props) {
  const total = items.reduce((sum, i) => sum + cartItemTotal(i), 0)

  return (
    <div className="cart-screen">
      <header className="cart-screen__header">
        <button className="btn btn-outline" onClick={onBack} disabled={sending}>
          ← Voltar ao cardápio
        </button>
        <h1>Seu pedido</h1>
      </header>

      {items.length === 0 ? (
        <p className="menu-screen__status">Seu carrinho está vazio.</p>
      ) : (
        <ul className="cart-list">
          {items.map((item) => (
            <li key={item.cartId} className="cart-item">
              <div className="cart-item__info">
                <h3 className="cart-item__name">{item.menuItem.nome}</h3>
                {item.selectedOptions.length > 0 && (
                  <p className="cart-item__mods">
                    {item.selectedOptions.map((o) => o.option_nome).join(', ')}
                  </p>
                )}
                {item.observacoes && <p className="cart-item__obs">Obs: {item.observacoes}</p>}
                <p className="cart-item__unit">{formatCHF(item.unitPrice)} / un.</p>
              </div>

              <div className="cart-item__controls">
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
                <span className="cart-item__total">{formatCHF(cartItemTotal(item))}</span>
                <button className="cart-item__remove" onClick={() => onRemove(item.cartId)} aria-label="Remover item">
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="cart-screen__footer">
        <div className="cart-screen__total">
          <span>Total</span>
          <strong>{formatCHF(total)}</strong>
        </div>
        <button
          className="btn btn-primary btn-block"
          disabled={items.length === 0 || sending}
          onClick={onSubmit}
        >
          {sending ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </footer>
    </div>
  )
}
