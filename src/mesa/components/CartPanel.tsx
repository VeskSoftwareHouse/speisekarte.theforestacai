import { useEffect, useRef, useState } from 'react'
import { ShoppingBag, X, Minus, Plus } from 'lucide-react'
import { formatCHF, formatSelectedOptionLabel } from '@shared/format'
import { FallbackPhotoIcon } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import type { CartItem } from '../types'
import { cartItemTotal } from '../types'

// Precisam bater com as durações correspondentes no mesa.css.
const ROW_EXIT_MS = 260
const TOTAL_ROLL_MS = 420
const WAKE_MS = 800

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Mantém por um instante as linhas que acabaram de ser removidas, para que elas
 * possam encolher em vez de sumir de uma vez. O React desmonta na hora, então
 * sem esta lista paralela não haveria o que animar.
 */
function useLingeringRows(items: CartItem[]): { item: CartItem; leaving: boolean }[] {
  const [removed, setRemoved] = useState<CartItem[]>([])
  const previous = useRef<CartItem[]>(items)

  useEffect(() => {
    const present = new Set(items.map((i) => i.cartId))
    const gone = previous.current.filter((i) => !present.has(i.cartId))
    previous.current = items
    if (gone.length === 0) return

    setRemoved((list) => [...list, ...gone])
    const id = window.setTimeout(() => {
      const ids = new Set(gone.map((g) => g.cartId))
      setRemoved((list) => list.filter((r) => !ids.has(r.cartId)))
    }, ROW_EXIT_MS)
    return () => window.clearTimeout(id)
  }, [items])

  return [
    ...items.map((item) => ({ item, leaving: false })),
    ...removed.map((item) => ({ item, leaving: true })),
  ]
}

/** Faz o total correr até o novo valor, como um contador de posto. */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    if (start === value || reducedMotion()) {
      from.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    let raf = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - t0) / TOTAL_ROLL_MS)
      setShown(start + (value - start) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    })
    // Rede de segurança: com a aba em segundo plano o requestAnimationFrame não
    // roda, e o total é dinheiro — não pode ficar parado num valor intermediário.
    const snap = window.setTimeout(() => setShown(value), TOTAL_ROLL_MS + 120)
    from.current = value
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(snap)
    }
  }, [value])

  return shown
}

/** Verdadeiro por um instante logo depois de algo sair de desabilitado. */
function useJustEnabled(enabled: boolean): boolean {
  const [waking, setWaking] = useState(false)
  const previous = useRef(enabled)

  useEffect(() => {
    const woke = enabled && !previous.current
    previous.current = enabled
    if (!woke) return
    setWaking(true)
    const id = window.setTimeout(() => setWaking(false), WAKE_MS)
    return () => window.clearTimeout(id)
  }, [enabled])

  return waking
}

interface Props {
  items: CartItem[]
  isOpen: boolean
  onChangeQuantity: (cartId: string, delta: number) => void
  onRemove: (cartId: string) => void
  onSubmit: () => void
  onClose: () => void
}

export default function CartPanel({ items, isOpen, onChangeQuantity, onRemove, onSubmit, onClose }: Props) {
  const { t, lang } = useLanguage()
  const total = items.reduce((sum, i) => sum + cartItemTotal(i), 0)
  const count = items.reduce((sum, i) => sum + i.quantidade, 0)

  const rows = useLingeringRows(items)
  const shownTotal = useCountUp(total)
  const wakingUp = useJustEnabled(items.length > 0)

  return (
    <aside className={`cart-panel ${isOpen ? 'cart-panel--open' : ''}`}>
      <header className="cart-panel__header">
        <ShoppingBag size={20} strokeWidth={2} aria-hidden />
        {t('cartTitle')}
        {/* A key remonta o contador a cada mudança e rearma a batida. */}
        {count > 0 && (
          <span key={count} className="cart-panel__count">
            {count}
          </span>
        )}
        <button className="cart-panel__close" onClick={onClose} aria-label={t('modalClose')}>
          <X size={20} strokeWidth={2} />
        </button>
      </header>

      {rows.length === 0 ? (
        <p className="cart-panel__empty">
          <img src="/brand/logo-base.png" alt="" className="cart-panel__empty-bird" aria-hidden />
          {t('cartEmptyLine1')}
          <br />
          {t('cartEmptyLine2')}
        </p>
      ) : (
        <ul className="cart-panel__list">
          {rows.map(({ item, leaving }) => (
            <li
              key={item.cartId}
              className={`cart-panel__item ${leaving ? 'cart-panel__item--leaving' : ''}`}
            >
              <div className="cart-panel__thumb">
                {item.menuItem.foto_url ? (
                  <img src={item.menuItem.foto_url} alt="" />
                ) : (
                  <FallbackPhotoIcon className="cart-panel__thumb-fallback" size={22} strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="cart-panel__info">
                <div className="cart-panel__name-row">
                  <span className="cart-panel__name">
                    {translatedField(item.menuItem.nome_i18n, lang, item.menuItem.nome) ?? item.menuItem.nome}
                  </span>
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
                    {item.selectedOptions
                      .map((o) =>
                        formatSelectedOptionLabel(translatedField(o.option_nome_i18n, lang, o.option_nome) ?? o.option_nome, o.quantidade),
                      )
                      .join(', ')}
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
          <strong key={total} className="cart-panel__total-value">
            {formatCHF(shownTotal)}
          </strong>
        </div>
        <button
          className={`btn btn-primary btn-block ${wakingUp ? 'btn--waking' : ''}`}
          disabled={items.length === 0}
          onClick={onSubmit}
        >
          {t('checkoutButton')} →
        </button>
      </footer>
    </aside>
  )
}
