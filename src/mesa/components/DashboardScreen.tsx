import { useMemo, useState } from 'react'
import { ChefHat, ChevronDown, Plus } from 'lucide-react'
import { useMenu } from '@shared/hooks/useMenu'
import type { MenuItemWithModifiers, RestaurantTable } from '@shared/types'
import { formatCHF } from '@shared/format'
import Sidebar, { FEATURED_ID } from './Sidebar'
import CartPanel from './CartPanel'
import ItemModal from './ItemModal'
import { iconFor, FeaturedIcon, FallbackPhotoIcon } from '../categoryIcons'
import type { CartItem } from '../types'

interface Props {
  table: RestaurantTable
  cart: CartItem[]
  sending: boolean
  onAddToCart: (item: CartItem) => void
  onChangeQuantity: (cartId: string, delta: number) => void
  onRemove: (cartId: string) => void
  onSubmit: () => void
  onChangeTable: () => void
}

export default function DashboardScreen({
  table,
  cart,
  sending,
  onAddToCart,
  onChangeQuantity,
  onRemove,
  onSubmit,
  onChangeTable,
}: Props) {
  const { categories, itemsByCategory, loading, error } = useMenu()
  const [activeCategory, setActiveCategory] = useState<string>(FEATURED_ID)
  const [selectedItem, setSelectedItem] = useState<MenuItemWithModifiers | null>(null)

  const featuredItems = useMemo(
    () => categories.flatMap((c) => (itemsByCategory[c.id] ?? []).slice(0, 2)).slice(0, 6),
    [categories, itemsByCategory],
  )

  const items = activeCategory === FEATURED_ID ? featuredItems : itemsByCategory[activeCategory] ?? []
  const activeCategoryObj = categories.find((c) => c.id === activeCategory)
  const sectionTitle = activeCategory === FEATURED_ID ? 'Destaques' : activeCategoryObj?.nome ?? ''
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
        <Sidebar
          categories={categories}
          activeId={activeCategory}
          onSelect={setActiveCategory}
          tableNumero={table.numero}
          onChangeTable={onChangeTable}
        />

        <main className="dashboard__main">
          <header className="dashboard__header">
            <div>
              <h1>Olá! O que vai ser hoje?</h1>
              <p>Monte do seu jeito ou escolha uma das nossas opções</p>
            </div>
            <div className="dashboard__notice">
              <ChefHat size={18} strokeWidth={2} aria-hidden />
              Pedidos feitos aqui são enviados direto para a cozinha
            </div>
          </header>

          {error && <p className="menu-screen__error">Erro ao carregar cardápio: {error}</p>}
          {loading && <p className="menu-screen__status">Carregando cardápio…</p>}

          {!loading && (
            <>
              <h2 className="dashboard__section-title">
                <SectionIcon size={22} strokeWidth={2} aria-hidden /> {sectionTitle}
              </h2>

              <div className="menu-grid menu-grid--dashboard">
                {items.length === 0 && <p className="menu-screen__status">Nenhum item nesta categoria.</p>}
                {items.map((item) => (
                  <button key={item.id} className="item-card" onClick={() => handleCardClick(item)}>
                    <div className="item-card__photo-wrap">
                      {item.foto_url ? (
                        <img className="item-card__photo" src={item.foto_url} alt={item.nome} loading="lazy" />
                      ) : (
                        <FallbackPhotoIcon className="item-card__photo-fallback" size={40} strokeWidth={1.5} aria-hidden />
                      )}
                    </div>
                    <div className="item-card__body">
                      <h3 className="item-card__name">{item.nome}</h3>
                      {item.descricao && <p className="item-card__desc">{item.descricao}</p>}
                      <div className="item-card__footer">
                        <span className="item-card__price">{formatCHF(item.preco)}</span>
                        <span className="item-card__add" aria-hidden>
                          <Plus size={18} strokeWidth={2.5} />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {activeCategory === FEATURED_ID && categories[0] && (
                <button className="dashboard__see-all" onClick={() => setActiveCategory(categories[0].id)}>
                  Ver cardápio completo
                  <ChevronDown size={18} strokeWidth={2} aria-hidden />
                </button>
              )}
            </>
          )}
        </main>

        <CartPanel
          items={cart}
          sending={sending}
          onChangeQuantity={onChangeQuantity}
          onRemove={onRemove}
          onSubmit={onSubmit}
        />
      </div>

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
