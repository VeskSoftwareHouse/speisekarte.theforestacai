import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { FallbackPhotoIcon } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import type { CartItem } from '../types'
import { cartItemTotal } from '../types'

const TIP_OPTIONS = [0, 5, 10, 20]

interface Props {
  items: CartItem[]
  tableNumero: string
  sending: boolean
  onConfirm: (customerName: string, tip: number) => void
  onBack: () => void
}

export default function OrderSummaryScreen({ items, tableNumero, sending, onConfirm, onBack }: Props) {
  const { t, lang } = useLanguage()
  const [customerName, setCustomerName] = useState('')
  const [tip, setTip] = useState(0)

  const subtotal = items.reduce((sum, i) => sum + cartItemTotal(i), 0)
  const total = subtotal + tip

  return (
    <div className="order-summary">
      <div className="order-summary__card">
        <header className="order-summary__header">
          <button
            className="order-summary__back"
            onClick={onBack}
            aria-label={t('backToMenuButton')}
            disabled={sending}
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <div>
            <h1>{t('orderSummaryTitle')}</h1>
            <p className="order-summary__subtitle">
              {t('orderSummarySubtitle')} · {t('tableLabel')} {tableNumero}
            </p>
          </div>
        </header>

        <div className="order-summary__scroll">
          <ul className="order-summary__list">
            {items.map((item) => (
              <li key={item.cartId} className="order-summary__item">
                <div className="cart-panel__thumb">
                  {item.menuItem.foto_url ? (
                    <img src={item.menuItem.foto_url} alt="" />
                  ) : (
                    <FallbackPhotoIcon className="cart-panel__thumb-fallback" size={22} strokeWidth={1.5} aria-hidden />
                  )}
                </div>
                <div className="order-summary__item-info">
                  <div className="order-summary__item-title">
                    <span className="order-summary__item-qty">{item.quantidade}×</span>
                    <span className="order-summary__item-name">
                      {translatedField(item.menuItem.nome_i18n, lang, item.menuItem.nome) ?? item.menuItem.nome}
                    </span>
                  </div>
                  {item.selectedOptions.length > 0 && (
                    <p className="cart-panel__mods">
                      {item.selectedOptions
                        .map((o) => translatedField(o.option_nome_i18n, lang, o.option_nome))
                        .join(', ')}
                    </p>
                  )}
                  {item.observacoes && (
                    <p className="cart-panel__obs">
                      {t('obsPrefix')}
                      {item.observacoes}
                    </p>
                  )}
                </div>
                <span className="cart-panel__price">{formatCHF(cartItemTotal(item))}</span>
              </li>
            ))}
          </ul>

          <label className="order-summary__field">
            <span>{t('orderNameLabel')}</span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t('orderNamePlaceholder')}
              maxLength={80}
            />
          </label>

          <div className="order-summary__field">
            <span>{t('tipLabel')}</span>
            <div className="order-summary__tip-options">
              {TIP_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`option-pill ${tip === v ? 'option-pill--active' : ''}`}
                  onClick={() => setTip(v)}
                >
                  {v === 0 ? t('noTip') : formatCHF(v)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="order-summary__footer">
          <div className="order-summary__totals">
            <div className="order-summary__totals-row">
              <span>{t('subtotalLabel')}</span>
              <span>{formatCHF(subtotal)}</span>
            </div>
            {tip > 0 && (
              <div className="order-summary__totals-row">
                <span>{t('tipLabel')}</span>
                <span>{formatCHF(tip)}</span>
              </div>
            )}
            <div className="cart-panel__total">
              <span>{t('totalLabel')}</span>
              <strong>{formatCHF(total)}</strong>
            </div>
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={items.length === 0 || sending}
            onClick={() => onConfirm(customerName.trim(), tip)}
          >
            {sending ? t('sending') : t('confirmAndPayButton')}
          </button>
        </footer>
      </div>
    </div>
  )
}
