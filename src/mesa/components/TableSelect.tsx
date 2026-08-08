import { useTables } from '@shared/hooks/useTables'
import type { RestaurantTable } from '@shared/types'

interface Props {
  onSelect: (table: RestaurantTable) => void
}

export default function TableSelect({ onSelect }: Props) {
  const { tables, loading } = useTables()

  return (
    <div className="table-select">
      <img src="/brand/logo.png" alt="Forest Açaí" className="table-select__logo" />
      <h1 className="table-select__title">Bem-vindo!</h1>
      <p className="table-select__subtitle">Toque no número da sua mesa para começar</p>

      {loading && <p className="table-select__status">Carregando mesas…</p>}
      {!loading && tables.length === 0 && (
        <p className="table-select__status">
          Nenhuma mesa cadastrada ainda. Rode o <code>supabase/seed.sql</code> para popular dados de exemplo.
        </p>
      )}

      <div className="table-select__grid">
        {tables.map((t) => (
          <button key={t.id} className="table-select__btn" onClick={() => onSelect(t)}>
            {t.numero}
          </button>
        ))}
      </div>
    </div>
  )
}
