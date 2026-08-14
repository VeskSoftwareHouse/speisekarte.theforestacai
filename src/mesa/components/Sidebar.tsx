import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { Category } from '@shared/types'
import { iconFor, FeaturedIcon } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import LanguageSelector from './LanguageSelector'

export const FEATURED_ID = '__destaques__'

interface Props {
  categories: Category[]
  activeId: string
  onSelect: (id: string) => void
}

export default function Sidebar({ categories, activeId, onSelect }: Props) {
  const { t, lang } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleSelect(id: string) {
    onSelect(id)
    setMenuOpen(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__bar">
        <button
          type="button"
          className="sidebar__menu-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t('menuLabel')}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
        </button>
        <div className="sidebar__logo">
          <img src="/brand/logo.png" alt="Forest Açaí" className="sidebar__logo-img" />
          <p className="sidebar__logo-tag">{t('sidebarTagline')}</p>
        </div>
      </div>

      <div className={`sidebar__drawer ${menuOpen ? 'sidebar__drawer--open' : ''}`}>
        <nav className="sidebar__nav">
          <button
            className={`sidebar__item ${activeId === FEATURED_ID ? 'sidebar__item--active' : ''}`}
            onClick={() => handleSelect(FEATURED_ID)}
          >
            <FeaturedIcon className="sidebar__item-icon" size={20} strokeWidth={2} />
            {t('navFeatured')}
          </button>
          {categories.map((c) => {
            const Icon = iconFor(c.nome)
            return (
              <button
                key={c.id}
                className={`sidebar__item ${activeId === c.id ? 'sidebar__item--active' : ''}`}
                onClick={() => handleSelect(c.id)}
              >
                <Icon className="sidebar__item-icon" size={20} strokeWidth={2} />
                {translatedField(c.nome_i18n, lang, c.nome)}
              </button>
            )
          })}
        </nav>

        <div className="sidebar__divider" />

        <div className="sidebar__footer">
          <LanguageSelector variant="dark" />
        </div>
      </div>

      {menuOpen && <div className="sidebar__backdrop" onClick={() => setMenuOpen(false)} />}
    </aside>
  )
}
