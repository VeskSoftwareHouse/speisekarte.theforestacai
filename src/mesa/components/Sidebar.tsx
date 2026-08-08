import type { Category } from '@shared/types'
import { iconFor, FeaturedIcon } from '../categoryIcons'

export const FEATURED_ID = '__destaques__'

interface Props {
  categories: Category[]
  activeId: string
  onSelect: (id: string) => void
  tableNumero: string
  onChangeTable: () => void
}

export default function Sidebar({ categories, activeId, onSelect, tableNumero, onChangeTable }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <img src="/brand/logo.png" alt="Forest Açaí" className="sidebar__logo-img" />
        <p className="sidebar__logo-name">FOREST AÇAÍ</p>
        <p className="sidebar__logo-tag">O sabor do Brasil na Suíça</p>
      </div>

      <nav className="sidebar__nav">
        <button
          className={`sidebar__item ${activeId === FEATURED_ID ? 'sidebar__item--active' : ''}`}
          onClick={() => onSelect(FEATURED_ID)}
        >
          <FeaturedIcon className="sidebar__item-icon" size={20} strokeWidth={2} />
          Destaques
        </button>
        {categories.map((c) => {
          const Icon = iconFor(c.nome)
          return (
            <button
              key={c.id}
              className={`sidebar__item ${activeId === c.id ? 'sidebar__item--active' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              <Icon className="sidebar__item-icon" size={20} strokeWidth={2} />
              {c.nome}
            </button>
          )
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__table">
          <span>Mesa {tableNumero}</span>
          <button onClick={onChangeTable}>Trocar</button>
        </div>
      </div>
    </aside>
  )
}
