import { Check } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'
import Celebration from './Celebration'

interface Props {
  onNewOrder: () => void
}

export default function ConfirmationScreen({ onNewOrder }: Props) {
  const { t } = useLanguage()

  return (
    <div className="confirmation-screen confirmation-screen--celebrating">
      <Celebration />
      <div className="confirmation-screen__icon confirmation-screen__icon--drawn">
        <Check size={44} strokeWidth={3} />
      </div>
      <h1>{t('confirmationTitle')}</h1>
      <p>{t('confirmationBody')}</p>
      <button className="btn btn-primary" onClick={onNewOrder}>
        {t('newOrderButton')}
      </button>
    </div>
  )
}
