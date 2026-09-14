import { useEffect, useState, type CSSProperties } from 'react'
import { Info } from 'lucide-react'
import { useMenu } from '@shared/hooks/useMenu'
import type { MenuItemWithModifiers } from '@shared/types'
import { formatCHF } from '@shared/format'
import Sidebar, { FEATURED_ID } from '../mesa/components/Sidebar'
import IngredientsPopup from '../mesa/components/IngredientsPopup'
import { iconFor, FeaturedIcon, FallbackPhotoIcon } from '../mesa/categoryIcons'
import { useLanguage } from '../mesa/i18n/LanguageContext'
import { translatedField } from '../mesa/i18n/menuTranslations'
import CatalogItemModal from './CatalogItemModal'

// Precisa bater com a duração de .catalog--leaving no mesa.css.
const CATEGORY_EXIT_MS = 180

/**
 * Cardápio só para consulta: mesma navegação e mesmos produtos do App da
 * Mesa (reaproveita Sidebar, useMenu, ícones e traduções de lá), mas sem
 * carrinho, sem "adicionar" e sem nenhuma chamada a /api — tocar num produto
 * só abre os detalhes pra ler, nunca faz nada que custe dinheiro. Pensado
 * pra um link/QR code que alguém abre no próprio celular antes de pedir de
 * verdade no totem ou com a equipe.
 */
export default function App() {
  const { categories, itemsByCategory, loading, error } = useMenu()
  const { lang, t } = useLanguage()
  const [activeCategory, setActiveCategory] = useState<string>(FEATURED_ID)
  const [selectedItem, setSelectedItem] = useState<MenuItemWithModifiers | null>(null)
  const [ingredientsItem, setIngredientsItem] = useState<MenuItemWithModifiers | null>(null)

  const featuredItems = (() => {
    const curated = categories.flatMap((c) => (itemsByCategory[c.id] ?? []).filter((i) => i.destaque))
    if (curated.length > 0) return curated
    return categories.flatMap((c) => (itemsByCategory[c.id] ?? []).slice(0, 2)).slice(0, 6)
  })()

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

  return (
    <div className="dashboard">
      <div className="dashboard__top">
        <Sidebar categories={categories} activeId={activeCategory} onSelect={setActiveCategory} />

        <main className="dashboard__main">
          <header className="dashboard__header">
            <div>
              <h1>{t('greetingTitle')}</h1>
              <p>{t('catalogNotice')}</p>
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
                      <button className="item-card" onClick={() => setSelectedItem(item)}>
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
      </div>

      {selectedItem && <CatalogItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />}

      {ingredientsItem && (
        <IngredientsPopup
          nome={translatedField(ingredientsItem.nome_i18n, lang, ingredientsItem.nome) ?? ingredientsItem.nome}
          ingredientes={ingredientsItem.ingredientes}
          onClose={() => setIngredientsItem(null)}
        />
      )}
    </div>
  )
}
