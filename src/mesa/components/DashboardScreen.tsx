import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Check, ChefHat, Info, Plus, ShoppingBag } from 'lucide-react'
import { useMenu } from '@shared/hooks/useMenu'
import type { MenuItemWithModifiers } from '@shared/types'
import { formatCHF } from '@shared/format'
import Sidebar, { FEATURED_ID } from './Sidebar'
import CartPanel from './CartPanel'
import ItemModal from './ItemModal'
import IngredientsPopup from './IngredientsPopup'
import { iconFor, FeaturedIcon, FallbackPhotoIcon } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import type { CartItem } from '../types'
import { cartItemTotal } from '../types'
import { useFlyToCart } from './useFlyToCart'

// Precisa bater com a duração de .catalog--leaving no mesa.css.
const CATEGORY_EXIT_MS = 180
const ADDED_BADGE_MS = 900

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
  const [ingredientsItem, setIngredientsItem] = useState<MenuItemWithModifiers | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set())
  const { launch, layer: flyLayer } = useFlyToCart()

  const cartCount = cart.reduce((sum, i) => sum + i.quantidade, 0)
  const cartTotal = cart.reduce((sum, i) => sum + cartItemTotal(i), 0)

  // A equipe escolhe os produtos da página de Destaques marcando-os um a um
  // (MenuItem.destaque). Enquanto ninguém marcar nada, cai de volta nos dois
  // primeiros de cada categoria — para a página não ficar vazia antes do
  // primeiro uso do recurso.
  const featuredItems = useMemo(() => {
    const curated = categories.flatMap((c) => (itemsByCategory[c.id] ?? []).filter((i) => i.destaque))
    if (curated.length > 0) return curated
    return categories.flatMap((c) => (itemsByCategory[c.id] ?? []).slice(0, 2)).slice(0, 6)
  }, [categories, itemsByCategory])

  // Categoria sem nenhum produto disponível (vazia, ou só com produtos
  // desativados — itemsByCategory já só traz os disponíveis) não aparece na
  // barra lateral: não faz sentido a equipe/cliente entrar numa categoria
  // pra achar "nenhum item aqui".
  const visibleCategories = useMemo(
    () => categories.filter((c) => (itemsByCategory[c.id]?.length ?? 0) > 0),
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

  function handleAddDirect(item: MenuItemWithModifiers, card: HTMLElement) {
    launch(card.querySelector('.item-card__photo-wrap'), item.foto_url)
    markAdded(item.id)
    onAddToCart({
      cartId: crypto.randomUUID(),
      menuItem: item,
      quantidade: 1,
      observacoes: '',
      selectedOptions: [],
      unitPrice: item.preco,
    })
  }

  function handleCardClick(item: MenuItemWithModifiers, card: HTMLElement) {
    if (item.modifierGroups.length > 0) {
      setSelectedItem(item)
    } else {
      handleAddDirect(item, card)
    }
  }

  // O "+" do card vira ✓ por um instante, como recibo do toque.
  function markAdded(id: string) {
    setJustAdded((prev) => new Set(prev).add(id))
    window.setTimeout(
      () =>
        setJustAdded((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      ADDED_BADGE_MS,
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard__top">
        <Sidebar categories={visibleCategories} activeId={activeCategory} onSelect={setActiveCategory} />

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
                  const showIngredients = item.copo_pronto && item.ingredientes.length > 0
                  return (
                    <div key={item.id} className="item-card-slot" style={{ '--i': i } as CSSProperties}>
                      <button className="item-card" onClick={(e) => handleCardClick(item, e.currentTarget)}>
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
                            <span
                              className={`item-card__add ${
                                justAdded.has(item.id) ? 'item-card__add--done' : ''
                              }`}
                              aria-hidden
                            >
                              {justAdded.has(item.id) ? (
                                <Check size={18} strokeWidth={3} />
                              ) : (
                                <Plus size={18} strokeWidth={2.5} />
                              )}
                            </span>
                          </div>
                        </div>
                      </button>
                      {showIngredients && (
                        <button
                          type="button"
                          className="item-card__ingredients-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setIngredientsItem(item)
                          }}
                          aria-label={t('ingredientsButton')}
                          title={t('ingredientsButton')}
                        >
                          <Info size={16} strokeWidth={2} aria-hidden />
                          {t('ingredientsButton')}
                        </button>
                      )}
                    </div>
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
          {/* A key remonta o contador a cada mudança, e é isso que rearma a
              batida — sem ela o número trocaria sem ninguém perceber. */}
          <span key={cartCount} className="cart-fab__count">
            {cartCount}
          </span>
          {t('viewCartButton')}
          <span className="cart-fab__total">{formatCHF(cartTotal)}</span>
        </button>
      )}

      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAdd={(cartItem) => {
            // A foto do modal ainda está montada aqui; depois de fechar não teria
            // de onde partir o voo. Produto sem foto não tem .modal__photo, então
            // o voo parte do título — senão esses itens não teriam animação.
            launch(
              document.querySelector('.modal__photo') ?? document.querySelector('.modal__title'),
              cartItem.menuItem.foto_url,
            )
            markAdded(cartItem.menuItem.id)
            onAddToCart(cartItem)
            setSelectedItem(null)
          }}
        />
      )}

      {ingredientsItem && (
        <IngredientsPopup
          nome={translatedField(ingredientsItem.nome_i18n, lang, ingredientsItem.nome) ?? ingredientsItem.nome}
          ingredientes={ingredientsItem.ingredientes}
          onClose={() => setIngredientsItem(null)}
        />
      )}

      {flyLayer}
    </div>
  )
}
