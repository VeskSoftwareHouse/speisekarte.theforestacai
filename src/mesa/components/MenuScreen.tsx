import { useState } from 'react'
import { useMenu } from '@shared/hooks/useMenu'
import type { MenuItemWithModifiers, RestaurantTable } from '@shared/types'
import { formatCHF } from '@shared/format'
import ItemModal from './ItemModal'
import type { CartItem } from '../types'

interface Props {
  table: RestaurantTable
  cartCount: number
  cartTotal: number
  onAddToCart: (item: CartItem) => void
  onOpenCart: () => void
  onChangeTable: () => void
}

export default function MenuScreen({ table, cartCount, cartTotal, onAddToCart, onOpenCart, onChangeTable }: Props) {
  const { categories, itemsByCategory, loading, error } = useMenu()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<MenuItemWithModifiers | null>(null)

  const current = activeCategory ?? categories[0]?.id ?? null
  const items = current ? itemsByCategory[current] ?? [] : []

  return (
    <div className="menu-screen">
      <header className="brand-banner">
        <img src="/brand/logo.png" alt="Forest Açaí" className="brand-banner__logo" />
        <div className="brand-banner__info">
          <p className="brand-banner__eyebrow">Mesa</p>
          <h1 className="brand-banner__value">{table.numero}</h1>
        </div>
        <button className="btn btn-outline btn-outline--dark" onClick={onChangeTable}>
          Trocar mesa
        </button>
      </header>

      {error && <p className="menu-screen__error">Erro ao carregar cardápio: {error}</p>}
      {loading && <p className="menu-screen__status">Carregando cardápio…</p>}

      {!loading && categories.length > 0 && (
        <nav className="category-tabs">
          {categories.map((c) => (
            <button
              key={c.id}
              className={`category-tabs__btn ${current === c.id ? 'category-tabs__btn--active' : ''}`}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.nome}
            </button>
          ))}
        </nav>
      )}

      <main className="menu-grid">
        {items.length === 0 && !loading && <p className="menu-screen__status">Nenhum item nesta categoria.</p>}
        {items.map((item) => (
          <button key={item.id} className="item-card" onClick={() => setSelectedItem(item)}>
            <div className="item-card__photo-wrap">
              {item.foto_url ? (
                <img className="item-card__photo" src={item.foto_url} alt={item.nome} loading="lazy" />
              ) : (
                <span className="item-card__photo-fallback" aria-hidden>
                  🍇
                </span>
              )}
            </div>
            <div className="item-card__body">
              <h3 className="item-card__name">{item.nome}</h3>
              {item.descricao && <p className="item-card__desc">{item.descricao}</p>}
              <div className="item-card__footer">
                <span className="item-card__price">{formatCHF(item.preco)}</span>
                <span className="item-card__add" aria-hidden>
                  +
                </span>
              </div>
            </div>
          </button>
        ))}
      </main>

      {cartCount > 0 && (
        <button className="cart-fab" onClick={onOpenCart}>
          <span className="cart-fab__count">{cartCount}</span>
          <span>Ver carrinho</span>
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
