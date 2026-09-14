import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Insumo, OrderWithItems } from '@shared/types'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import type { ConsumoPreview } from '../hooks/useFechamento'

interface Props {
  selecionados: OrderWithItems[]
  insumos: Insumo[]
  calcularConsumo: (selecionados: OrderWithItems[]) => Promise<ConsumoPreview>
  onClose: () => void
  onConfirm: () => Promise<void>
}

export default function FechamentoPreviewModal({ selecionados, insumos, calcularConsumo, onClose, onConfirm }: Props) {
  const [preview, setPreview] = useState<ConsumoPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let cancelado = false
    calcularConsumo(selecionados)
      .then((p) => {
        if (!cancelado) setPreview(p)
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : 'Não foi possível calcular o consumo.')
      })
      .finally(() => {
        if (!cancelado) setLoadingPreview(false)
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConfirm() {
    setConfirming(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível fechar os pedidos.')
      setConfirming(false)
    }
  }

  const insumosById: Record<string, Insumo> = {}
  for (const i of insumos) insumosById[i.id] = i

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal__header">
          <h2>Fechar {selecionados.length} {selecionados.length === 1 ? 'pedido' : 'pedidos'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <div className="admin-form admin-form--scroll">
          {loadingPreview && <p className="equipe-app__status">Calculando consumo…</p>}

          {preview && (
            <>
              <div className="admin-form__field">
                <span>Isto vai sair do estoque</span>
                {preview.porInsumo.length === 0 && (
                  <p className="admin-form__hint">
                    Nenhum insumo será descontado — os produtos deste lote não têm composição configurada.
                  </p>
                )}
                {preview.porInsumo.length > 0 && (
                  <div className="admin-consumo-list">
                    {preview.porInsumo.map((c) => {
                      const insumo = insumosById[c.insumo_id]
                      return (
                        <div key={c.insumo_id} className="admin-consumo-list__row">
                          <span>{insumo?.nome ?? 'Insumo removido'}</span>
                          <strong>
                            -{c.quantidade.toFixed(3)} {insumo ? UNIDADE_LABEL[insumo.unidade] : ''}
                          </strong>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {(preview.itensSemComposicao.length > 0 || preview.opcoesSemVinculo.length > 0) && (
                <p className="admin-panel__hint admin-panel__hint--warn">
                  Sem baixa configurada — não bloqueia o fechamento, só não desconta nada:{' '}
                  {[...preview.itensSemComposicao, ...preview.opcoesSemVinculo].join(', ')}
                </p>
              )}
            </>
          )}

          {error && <p className="admin-form__error">{error}</p>}

          <button
            className="btn btn-primary btn-block"
            onClick={handleConfirm}
            disabled={loadingPreview || confirming || !preview}
          >
            {confirming ? 'Fechando…' : 'Confirmar fechamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
