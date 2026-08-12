import { Check } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  tableNumero: string
  onNewOrder: () => void
}

export default function ConfirmationScreen({ tableNumero, onNewOrder }: Props) {
  const { t } = useLanguage()

  return (
    <div className="confirmation-screen">
      <div className="confirmation-screen__icon">
        <Check size={44} strokeWidth={3} />
      </div>
      <h1>{t('confirmationTitle')}</h1>
      <p>{t('confirmationBody', { numero: tableNumero })}</p>
      <button className="btn btn-primary" onClick={onNewOrder}>
        {t('newOrderButton')}
      </button>
    </div>
  )
}
