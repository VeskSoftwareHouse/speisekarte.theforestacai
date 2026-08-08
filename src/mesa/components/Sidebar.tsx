import type { Category } from '@shared/types'

export const FEATURED_ID = '__destaques__'

const CATEGORY_ICON: Record<string, string> = {
  'Açaí im Becher': '🥣',
  Kombos: '🎁',
  'Säfte — Klassiker': '🍍',
  'Säfte — Exotisch': '🌺',
  'Säfte — Premium': '✨',
}

function iconFor(nome: string): string {
  return CATEGORY_ICON[nome] ?? '🍇'
}

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
          <span className="sidebar__item-icon">🔥</span>
          Destaques
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`sidebar__item ${activeId === c.id ? 'sidebar__item--active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="sidebar__item-icon">{iconFor(c.nome)}</span>
            {c.nome}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__table">
          <span>Mesa {tableNumero}</span>
          <button onClick={onChangeTable}>Trocar</button>
        </div>
        <button className="sidebar__help">
          <span aria-hidden>🛎️</span>
          Precisa de ajuda?
          <small>Chame nossa equipe</small>
        </button>
      </div>
    </aside>
  )
}
