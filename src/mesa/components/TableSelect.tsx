import { useTables } from '@shared/hooks/useTables'
import type { RestaurantTable } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'
import LanguageSelector from './LanguageSelector'

interface Props {
  onSelect: (table: RestaurantTable) => void
}

export default function TableSelect({ onSelect }: Props) {
  const { tables, loading } = useTables()
  const { t } = useLanguage()

  return (
    <div className="table-select">
      <div className="table-select__lang">
        <LanguageSelector variant="dark" />
      </div>

      <img src="/brand/logo.png" alt="Forest Açaí" className="table-select__logo" />
      <h1 className="table-select__title">{t('welcomeTitle')}</h1>
      <p className="table-select__subtitle">{t('welcomeSubtitle')}</p>

      {loading && <p className="table-select__status">{t('loadingTables')}</p>}
      {!loading && tables.length === 0 && (
        <p className="table-select__status">
          Nenhuma mesa cadastrada ainda. Rode o <code>supabase/seed.sql</code> para popular dados de exemplo.
        </p>
      )}

      <div className="table-select__grid">
        {tables.map((tb) => (
          <button key={tb.id} className="table-select__btn" onClick={() => onSelect(tb)}>
            {tb.numero}
          </button>
        ))}
      </div>
    </div>
  )
}
