import { X } from 'lucide-react'
import type { ModifierOption } from '@shared/types'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'

interface Props {
  nome: string
  ingredientes: ModifierOption[]
  onClose: () => void
}

/**
 * Popup leve com a lista de ingredientes de um "copo pronto" (MenuItem.copo_pronto)
 * — só informativo, sem seleção nem preço. Aberto direto do botão no card do
 * produto, não do modal de personalização: um item sem grupos de adicional
 * (o caso comum de um copo pronto) adiciona ao carrinho assim que o card é
 * tocado, sem nunca abrir modal nenhum — este é o único jeito de ver o que
 * tem dentro antes de pedir.
 */
export default function IngredientsPopup({ nome, ingredientes, onClose }: Props) {
  const { lang, t } = useLanguage()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label={t('modalClose')}>
          <X size={20} strokeWidth={2} />
        </button>

        <div className="modal__scroll">
          <h2 className="modal__title">{t('ingredientsTitle')}</h2>
          <p className="modal__desc">{nome}</p>
          <div className="modal__options">
            {ingredientes.map((option) => (
              <span key={option.id} className="option-pill">
                {option.foto_url && (
                  <img className="option-pill__photo" src={option.foto_url} alt="" loading="lazy" />
                )}
                {translatedField(option.nome_i18n, lang, option.nome)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
