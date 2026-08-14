import { useMemo, useState } from 'react'
import { ChefHat, Plus, ShoppingBag } from 'lucide-react'
import { useMenu } from '@shared/hooks/useMenu'
import type { MenuItemWithModifiers } from '@shared/types'
import { formatCHF } from '@shared/format'
import Sidebar, { FEATURED_ID } from './Sidebar'
import CartPanel from './CartPanel'
import ItemModal from './ItemModal'
import { iconFor, FeaturedIcon, FallbackPhotoIcon } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import type { CartItem } from '../types'
import { cartItemTotal } from '../types'

interface Props {
  cart: CartItem[]
  onAddToCart: (item: CartItem) => void
  onChangeQuantity: (cartId: string, delta: number) => void
  onRemove: (cartId: string) => void
  onSubmit: () => void
}

export default function DashboardScreen({ cart, onAddToCart, onChangeQuantity, onRemove, onSubmit }: Props) {
  const { categories, itemsByCategory, loading, error } = useMenu()
  const { lang, t } = useLanguage()
  const [activeCategory, setActiveCategory] = useState<string>(FEATURED_ID)
  const [selectedItem, setSelectedItem] = useState<MenuItemWithModifiers | null>(null)
  const [cartOpen, setCartOpen] = useState(false)

  const cartCount = cart.reduce((sum, i) => sum + i.quantidade, 0)
  const cartTotal = cart.reduce((sum, i) => sum + cartItemTotal(i), 0)

  const featuredItems = useMemo(
    () => categories.flatMap((c) => (itemsByCategory[c.id] ?? []).slice(0, 2)).slice(0, 6),
    [categories, itemsByCategory],
  )

  const items = activeCategory === FEATURED_ID ? featuredItems : itemsByCategory[activeCategory] ?? []
  const activeCategoryObj = categories.find((c) => c.id === activeCategory)
  const sectionTitle =
    activeCategory === FEATURED_ID
      ? t('navFeatured')
      : translatedField(activeCategoryObj?.nome_i18n, lang, activeCategoryObj?.nome ?? '')
  const SectionIcon = activeCategory === FEATURED_ID ? FeaturedIcon : iconFor(activeCategoryObj?.nome ?? '')

  function handleAddDirect(item: MenuItemWithModifiers) {
    onAddToCart({
      cartId: crypto.randomUUID(),
      menuItem: item,
      quantidade: 1,
      observacoes: '',
      selectedOptions: [],
      unitPrice: item.preco,
    })
  }

  function handleCardClick(item: MenuItemWithModifiers) {
    if (item.modifierGroups.length > 0) {
      setSelectedItem(item)
    } else {
      handleAddDirect(item)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__top">
        <Sidebar categories={categories} activeId={activeCategory} onSelect={setActiveCategory} />

        <main className="dashboard__main">
          <header className="dashboard__header">
            <div>
              <h1>{t('greetingTitle')}</h1>
              <p>{t('greetingSubtitle')}</p>
            </div>
            <div className="dashboard__notice">
              <ChefHat size={18} strokeWidth={2} aria-hidden />
              {t('kitchenNotice')}
            </div>
          </header>

          {error && (
            <p className="menu-screen__error">
              {t('errorMenuPrefix')}
              {error}
            </p>
          )}
          {loading && <p className="menu-screen__status">{t('loadingMenu')}</p>}

          {!loading && (
            <>
              <h2 className="dashboard__section-title">
                <SectionIcon size={22} strokeWidth={2} aria-hidden /> {sectionTitle}
              </h2>

              <div className="menu-grid menu-grid--dashboard">
                {items.length === 0 && <p className="menu-screen__status">{t('noItemsInCategory')}</p>}
                {items.map((item) => {
                  const desc = translatedField(item.descricao_i18n, lang, item.descricao)
                  const nome = translatedField(item.nome_i18n, lang, item.nome) ?? item.nome
                  return (
                    <button key={item.id} className="item-card" onClick={() => handleCardClick(item)}>
                      <div className="item-card__photo-wrap">
                        {item.foto_url ? (
                          <img className="item-card__photo" src={item.foto_url} alt={nome} loading="lazy" />
                        ) : (
                          <FallbackPhotoIcon
                            className="item-card__photo-fallback"
                            size={40}
                            strokeWidth={1.5}
                            aria-hidden
                          />
                        )}
                      </div>
                      <div className="item-card__body">
                        <h3 className="item-card__name">{nome}</h3>
                        {desc && <p className="item-card__desc">{desc}</p>}
                        <div className="item-card__footer">
                          <span className="item-card__price">{formatCHF(item.preco)}</span>
                          <span className="item-card__add" aria-hidden>
                            <Plus size={18} strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </main>

        <CartPanel
          items={cart}
          isOpen={cartOpen}
          onChangeQuantity={onChangeQuantity}
          onRemove={onRemove}
          onSubmit={onSubmit}
          onClose={() => setCartOpen(false)}
        />
      </div>

      {cartOpen && <div className="cart-backdrop" onClick={() => setCartOpen(false)} />}

      {!cartOpen && cartCount > 0 && (
        <button className="cart-fab" onClick={() => setCartOpen(true)}>
          <ShoppingBag size={18} strokeWidth={2} aria-hidden />
          <span className="cart-fab__count">{cartCount}</span>
          {t('viewCartButton')}
          <span className="cart-fab__total">{formatCHF(cartTotal)}</span>
        </button>
      )}

      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAdd={(cartItem) => {
            onAddToCart(cartItem)
            setSelectedItem(null)
          }}
        />
      )}
    </div>
  )
}
