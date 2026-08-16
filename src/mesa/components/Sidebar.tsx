import { useEffect, useState, type CSSProperties } from 'react'
import { Menu, X } from 'lucide-react'
import type { Category } from '@shared/types'
import { iconFor, motionFor, FeaturedIcon, FEATURED_MOTION } from '../categoryIcons'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import LanguageSelector from './LanguageSelector'
import TaglineTypewriter from './TaglineTypewriter'

export const FEATURED_ID = '__destaques__'

interface Props {
  categories: Category[]
  activeId: string
  onSelect: (id: string) => void
}

export default function Sidebar({ categories, activeId, onSelect }: Props) {
  const { t, lang } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  // Tocar no tucano faz ele dar um pulinho — um agrado para quem espera na mesa.
  // O fim do pulo vem de um timer, e não de onAnimationEnd: com a aba em segundo
  // plano o evento pode nunca chegar e o tucano ficaria parado no meio do salto.
  const [hopping, setHopping] = useState(false)
  useEffect(() => {
    if (!hopping) return
    const id = window.setTimeout(() => setHopping(false), 800)
    return () => window.clearTimeout(id)
  }, [hopping])

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
          <div
            className={`sidebar__logo-bird ${hopping ? 'sidebar__logo-bird--hop' : ''}`}
            onClick={() => setHopping(true)}
          >
            {/* A arte vem fatiada em camadas (ver scripts/split-logo.mjs): a base
                traz o tucano com a asa e a mandíbula inferior substituídas por
                preenchimento escuro, e essas duas peças voltam por cima como
                imagens próprias, livres para girar. */}
            <img src="/brand/logo-base.png" alt="Forest Açaí" className="sidebar__logo-img" />
            <img src="/brand/logo-wing.png" alt="" aria-hidden className="sidebar__logo-wing" />
            <img src="/brand/logo-beak.png" alt="" aria-hidden className="sidebar__logo-beak" />
            <span className="sidebar__logo-glint" aria-hidden />
            <span className="sidebar__logo-eyelid" aria-hidden />
          </div>
          <TaglineTypewriter />
        </div>
      </div>

      <div className={`sidebar__drawer ${menuOpen ? 'sidebar__drawer--open' : ''}`}>
        <nav className="sidebar__nav">
          <button
            className={`sidebar__item ${activeId === FEATURED_ID ? 'sidebar__item--active' : ''}`}
            onClick={() => handleSelect(FEATURED_ID)}
            style={{ '--i': 0 } as CSSProperties}
          >
            {/* O invólucro cuida do toque e do hover; o próprio ícone fica com o
                movimento constante. São duas camadas porque as duas animações
                disputariam a mesma propriedade, e o ícone da categoria ativa
                congelaria assim que o "pop" terminasse. */}
            <span className="sidebar__item-icon-wrap">
              <FeaturedIcon
                className={`sidebar__item-icon sidebar__item-icon--${FEATURED_MOTION}`}
                size={20}
                strokeWidth={2}
              />
            </span>
            <span className="sidebar__item-label">{t('navFeatured')}</span>
          </button>
          {categories.map((c, i) => {
            const Icon = iconFor(c.nome)
            const motion = motionFor(c.nome)
            return (
              <button
                key={c.id}
                className={`sidebar__item ${activeId === c.id ? 'sidebar__item--active' : ''}`}
                onClick={() => handleSelect(c.id)}
                style={{ '--i': i + 1 } as CSSProperties}
              >
                <span className="sidebar__item-icon-wrap">
                  <Icon
                    className={`sidebar__item-icon sidebar__item-icon--${motion}`}
                    size={20}
                    strokeWidth={2}
                  />
                </span>
                <span className="sidebar__item-label">
                  {translatedField(c.nome_i18n, lang, c.nome)}
                </span>
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
