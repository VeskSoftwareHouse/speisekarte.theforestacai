import { Check } from 'lucide-react'

interface Props {
  tableNumero: string
  onNewOrder: () => void
}

export default function ConfirmationScreen({ tableNumero, onNewOrder }: Props) {
  return (
    <div className="confirmation-screen">
      <div className="confirmation-screen__icon">
        <Check size={44} strokeWidth={3} />
      </div>
      <h1>Pedido enviado!</h1>
      <p>
        Seu pedido chegou na cozinha da <strong>Mesa {tableNumero}</strong>. Em breve nossa equipe começa o preparo.
      </p>
      <button className="btn btn-primary" onClick={onNewOrder}>
        Fazer outro pedido
      </button>
    </div>
  )
}
