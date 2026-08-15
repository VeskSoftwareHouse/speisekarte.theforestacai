import { AlertTriangle, Loader2, Nfc } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  status: 'awaiting_tap' | 'confirming' | 'failed'
  onRetry?: () => void
  onBack?: () => void
}

export default function PaymentStatusScreen({ status, onRetry, onBack }: Props) {
  const { t } = useLanguage()

  if (status === 'awaiting_tap') {
    return (
      <div className="confirmation-screen">
        <div className="confirmation-screen__icon confirmation-screen__icon--pending">
          <Nfc size={44} strokeWidth={2.5} />
        </div>
        <h1>{t('awaitingTapTitle')}</h1>
        <p>{t('awaitingTapBody')}</p>
      </div>
    )
  }

  if (status === 'confirming') {
    return (
      <div className="confirmation-screen">
        <div className="confirmation-screen__icon confirmation-screen__icon--pending">
          <Loader2 size={44} strokeWidth={3} className="spin" />
        </div>
        <h1>{t('confirmingPayment')}</h1>
      </div>
    )
  }

  return (
    <div className="confirmation-screen">
      <div className="confirmation-screen__icon confirmation-screen__icon--error">
        <AlertTriangle size={44} strokeWidth={3} />
      </div>
      <h1>{t('paymentFailedTitle')}</h1>
      <p>{t('paymentFailedBody')}</p>
      <div className="confirmation-screen__actions">
        <button className="btn btn-primary" onClick={onRetry}>
          {t('retryButton')}
        </button>
        <button className="btn btn-outline" onClick={onBack}>
          {t('backToMenuButton')}
        </button>
      </div>
    </div>
  )
}
