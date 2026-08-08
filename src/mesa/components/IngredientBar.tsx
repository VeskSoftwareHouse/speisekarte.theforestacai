interface IngredientChip {
  id: string
  nome: string
}

const ICON_BY_NAME: Record<string, string> = {
  Banane: '🍌',
  Erdbeere: '🍓',
  Blaubeere: '🫐',
  Kiwi: '🥝',
  Granola: '🌾',
  Milchpulver: '🥛',
  Oreo: '🍪',
  Biscoff: '🍪',
  Powerball: '🍬',
  'M&M': '🍫',
  Erdnüsse: '🥜',
  'Smarties Mini': '🍬',
  Tapioka: '⚪',
  Kondensmilch: '🥛',
  Nutella: '🍫',
  Paçoca: '🥜',
  Ovomaltine: '🍫',
  'Granola Ovomaltine': '🌾',
}

function iconFor(nome: string): string {
  return ICON_BY_NAME[nome] ?? '🍇'
}

interface Props {
  active: boolean
  ingredients: IngredientChip[]
  onJumpToAcai: () => void
}

export default function IngredientBar({ active, ingredients, onJumpToAcai }: Props) {
  return (
    <nav className="ingredient-bar">
      <button className={`ingredient-bar__chip ${active ? 'ingredient-bar__chip--active' : ''}`} onClick={onJumpToAcai}>
        <span aria-hidden>🥣</span>
        Açaí
      </button>
      {ingredients.map((ing) => (
        <button key={ing.id} className="ingredient-bar__chip" onClick={onJumpToAcai}>
          <span aria-hidden>{iconFor(ing.nome)}</span>
          {ing.nome}
        </button>
      ))}
      <button className="ingredient-bar__chip ingredient-bar__chip--all" onClick={onJumpToAcai}>
        <span aria-hidden>⊞</span>
        Ver todos
      </button>
    </nav>
  )
}
