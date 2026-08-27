import { Check } from 'lucide-react'
import { useLanguage } from '../i18n/LanguageContext'
import Celebration from './Celebration'
import ReceiptQr from './ReceiptQr'

interface Props {
  /** Pedido recém-pago. Sem ele não há comprovante para oferecer. */
  orderId: string | null
  onNewOrder: () => void
}

export default function ConfirmationScreen({ orderId, onNewOrder }: Props) {
  const { t, lang } = useLanguage()

  // O endereço é montado a partir de onde o totem está: o mesmo código funciona
  // em produção e num deploy de preview, sem domínio escrito no código.
  const receiptUrl = orderId
    ? `${window.location.origin}/recibo/?pedido=${orderId}&lang=${lang}`
    : null

  return (
    <div className="confirmation-screen confirmation-screen--celebrating">
      <Celebration />
      <div className="confirmation-screen__icon confirmation-screen__icon--drawn">
        <Check size={44} strokeWidth={3} />
      </div>
      <h1>{t('confirmationTitle')}</h1>
      <p>{t('confirmationBody')}</p>

      {receiptUrl && (
        <div className="confirmation-screen__receipt">
          <ReceiptQr url={receiptUrl} />
          <p>{t('receiptQrLabel')}</p>
        </div>
      )}

      <button className="btn btn-primary" onClick={onNewOrder}>
        {t('newOrderButton')}
      </button>
    </div>
  )
}
