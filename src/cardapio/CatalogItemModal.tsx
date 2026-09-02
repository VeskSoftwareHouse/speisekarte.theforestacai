import { X } from 'lucide-react'
import type { MenuItemWithModifiers } from '@shared/types'
import { formatCHF } from '@shared/format'
import { useLanguage } from '../mesa/i18n/LanguageContext'
import { translatedField } from '../mesa/i18n/menuTranslations'

interface Props {
  item: MenuItemWithModifiers
  onClose: () => void
}

/**
 * Mesma cara do modal de produto do App da Mesa (ItemModal.tsx), mas sem
 * nenhum estado de escolha: não tem carrinho aqui, então as opções de
 * adicional aparecem só como informação — o preço de cada uma, sem poder
 * marcar nada — e não existe rodapé de "Adicionar".
 */
export default function CatalogItemModal({ item, onClose }: Props) {
  const { lang, t } = useLanguage()
  const desc = translatedField(item.descricao_i18n, lang, item.descricao)
  const nome = translatedField(item.nome_i18n, lang, item.nome) ?? item.nome

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label={t('modalClose')}>
          <X size={20} strokeWidth={2} />
        </button>

        <div className="modal__scroll">
          {item.foto_url && <img className="modal__photo" src={item.foto_url} alt={nome} />}
          <h2 className="modal__title">{nome}</h2>
          {desc && <p className="modal__desc">{desc}</p>}
          <p className="modal__price">{formatCHF(item.preco)}</p>

          {item.modifierGroups.map((group) => (
            <fieldset key={group.id} className="modal__group">
              <legend className="modal__group-title">
                {translatedField(group.nome_i18n, lang, group.nome)}
                <span className={`badge ${group.tipo === 'obrigatorio' ? 'badge--required' : 'badge--optional'}`}>
                  {group.tipo === 'obrigatorio' ? t('badgeRequired') : t('badgeOptional')}
                </span>
              </legend>
              <div className="modal__options">
                {group.options.map((option) => (
                  <span key={option.id} className="option-pill">
                    {option.foto_url && (
                      <img className="option-pill__photo" src={option.foto_url} alt="" loading="lazy" />
                    )}
                    {translatedField(option.nome_i18n, lang, option.nome)}
                    {option.preco_adicional > 0 && (
                      <span className="option-pill__price">+{formatCHF(option.preco_adicional)}</span>
                    )}
                  </span>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  )
}
