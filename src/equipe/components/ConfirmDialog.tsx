import { AlertTriangle } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Excluir', onConfirm, onCancel }: Props) {
  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <div className="admin-modal admin-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog">
          <AlertTriangle size={28} strokeWidth={2} className="confirm-dialog__icon" aria-hidden />
          <h3>{title}</h3>
          <p>{message}</p>
          <div className="confirm-dialog__actions">
            <button className="btn btn-outline btn-block" onClick={onCancel}>
              Cancelar
            </button>
            <button className="btn btn-danger btn-block" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
