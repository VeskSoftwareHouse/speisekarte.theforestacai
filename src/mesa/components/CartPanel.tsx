import { ShoppingBag, X, Minus, Plus } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { FallbackPhotoIcon } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translateLabel } from '../i18n/labelTranslations'
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
  const { t, lang } = useLanguage()
  const total = items.reduce((sum, i) => sum + cartItemTotal(i), 0)
  const count = items.reduce((sum, i) => sum + i.quantidade, 0)

  return (
    <aside className="cart-panel">
      <header className="cart-panel__header">
        <ShoppingBag size={20} strokeWidth={2} aria-hidden />
        {t('cartTitle')}
        {count > 0 && <span className="cart-panel__count">{count}</span>}
      </header>

      {items.length === 0 ? (
        <p className="cart-panel__empty">
          {t('cartEmptyLine1')}
          <br />
          {t('cartEmptyLine2')}
        </p>
      ) : (
        <ul className="cart-panel__list">
          {items.map((item) => (
            <li key={item.cartId} className="cart-panel__item">
              <div className="cart-panel__thumb">
                {item.menuItem.foto_url ? (
                  <img src={item.menuItem.foto_url} alt="" />
                ) : (
                  <FallbackPhotoIcon className="cart-panel__thumb-fallback" size={22} strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="cart-panel__info">
                <div className="cart-panel__name-row">
                  <span className="cart-panel__name">{item.menuItem.nome}</span>
                  <button
                    className="cart-panel__remove"
                    onClick={() => onRemove(item.cartId)}
                    aria-label={t('removeItem')}
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>
                {item.selectedOptions.length > 0 && (
                  <p className="cart-panel__mods">
                    {item.selectedOptions.map((o) => translateLabel(o.option_nome, lang)).join(', ')}
                  </p>
                )}
                {item.observacoes && (
                  <p className="cart-panel__obs">
                    {t('obsPrefix')}
                    {item.observacoes}
                  </p>
                )}
                <div className="cart-panel__row">
                  <div className="stepper stepper--sm">
                    <button
                      className="stepper__btn"
                      onClick={() => onChangeQuantity(item.cartId, -1)}
                      aria-label={t('decreaseQty')}
                    >
                      <Minus size={14} strokeWidth={2.5} />
                    </button>
                    <span className="stepper__value">{item.quantidade}</span>
                    <button
                      className="stepper__btn"
                      onClick={() => onChangeQuantity(item.cartId, 1)}
                      aria-label={t('increaseQty')}
                    >
                      <Plus size={14} strokeWidth={2.5} />
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
          <span>{t('totalLabel')}</span>
          <strong>{formatCHF(total)}</strong>
        </div>
        <button className="btn btn-primary btn-block" disabled={items.length === 0 || sending} onClick={onSubmit}>
          {sending ? t('sending') : `${t('checkoutButton')} →`}
        </button>
      </footer>
    </aside>
  )
}
