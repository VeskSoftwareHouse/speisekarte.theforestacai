import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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

// Precisa bater com a duração de .catalog--leaving no mesa.css.
const CATEGORY_EXIT_MS = 180

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

  // A categoria exibida fica um passo atrás da escolhida: no intervalo os cards
  // antigos continuam montados para poderem animar a saída. A sidebar já marca
  // a nova categoria na hora, então o toque não parece travado.
  const [shownCategory, setShownCategory] = useState<string>(FEATURED_ID)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (activeCategory === shownCategory) return
    setLeaving(true)
    const id = window.setTimeout(() => {
      setShownCategory(activeCategory)
      setLeaving(false)
    }, CATEGORY_EXIT_MS)
    return () => window.clearTimeout(id)
  }, [activeCategory, shownCategory])

  const items = shownCategory === FEATURED_ID ? featuredItems : itemsByCategory[shownCategory] ?? []
  const shownCategoryObj = categories.find((c) => c.id === shownCategory)
  const sectionTitle =
    shownCategory === FEATURED_ID
      ? t('navFeatured')
      : translatedField(shownCategoryObj?.nome_i18n, lang, shownCategoryObj?.nome ?? '')
  const SectionIcon = shownCategory === FEATURED_ID ? FeaturedIcon : iconFor(shownCategoryObj?.nome ?? '')

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
            // A key remonta o bloco a cada troca de categoria, o que rearma as
            // animações de entrada mesmo quando um produto aparece nas duas
            // listas (os destaques repetem itens das categorias).
            <div key={shownCategory} className={`catalog ${leaving ? 'catalog--leaving' : ''}`}>
              <h2 className="dashboard__section-title">
                <SectionIcon size={22} strokeWidth={2} aria-hidden /> {sectionTitle}
              </h2>

              <div className="menu-grid menu-grid--dashboard">
                {items.length === 0 && <p className="menu-screen__status">{t('noItemsInCategory')}</p>}
                {items.map((item, i) => {
                  const desc = translatedField(item.descricao_i18n, lang, item.descricao)
                  const nome = translatedField(item.nome_i18n, lang, item.nome) ?? item.nome
                  return (
                    <button
                      key={item.id}
                      className="item-card"
                      style={{ '--i': i } as CSSProperties}
                      onClick={() => handleCardClick(item)}
                    >
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
            </div>
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
