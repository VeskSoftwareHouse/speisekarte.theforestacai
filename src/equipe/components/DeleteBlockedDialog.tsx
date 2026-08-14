import { Ban } from 'lucide-react'

interface Props {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  onClose: () => void
}

export default function DeleteBlockedDialog({ title, message, actionLabel, onAction, onClose }: Props) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog">
          <Ban size={28} strokeWidth={2} className="confirm-dialog__icon confirm-dialog__icon--warning" aria-hidden />
          <h3>{title}</h3>
          <p>{message}</p>
          <div className="confirm-dialog__actions">
            {onAction && actionLabel ? (
              <>
                <button className="btn btn-outline btn-block" onClick={onClose}>
                  Fechar
                </button>
                <button className="btn btn-primary btn-block" onClick={onAction}>
                  {actionLabel}
                </button>
              </>
            ) : (
              <button className="btn btn-primary btn-block" onClick={onClose}>
                Entendi
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
