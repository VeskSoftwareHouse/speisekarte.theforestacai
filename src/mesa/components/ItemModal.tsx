import { useMemo, useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import type { MenuItemWithModifiers, SelectedModifierOption } from '@shared/types'
import { formatCHF } from '@shared/format'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import { translateLabel } from '../i18n/labelTranslations'
import type { CartItem } from '../types'

interface Props {
  item: MenuItemWithModifiers
  onClose: () => void
  onAdd: (cartItem: CartItem) => void
}

export default function ItemModal({ item, onClose, onAdd }: Props) {
  const { lang, t } = useLanguage()
  const desc = translatedField(item.descricao_i18n, lang, item.descricao)
  const nome = translatedField(item.nome_i18n, lang, item.nome) ?? item.nome
  const [quantidade, setQuantidade] = useState(1)
  const [observacoes, setObservacoes] = useState('')
  // groupId -> Set de optionIds selecionados
  const [selections, setSelections] = useState<Record<string, string[]>>({})

  const selectedOptions: SelectedModifierOption[] = useMemo(() => {
    const result: SelectedModifierOption[] = []
    for (const group of item.modifierGroups) {
      const chosenIds = selections[group.id] ?? []
      for (const optionId of chosenIds) {
        const option = group.options.find((o) => o.id === optionId)
        if (!option) continue
        result.push({
          modifier_id: group.id,
          modifier_nome: group.nome,
          option_id: option.id,
          option_nome: option.nome,
          preco_adicional: option.preco_adicional,
        })
      }
    }
    return result
  }, [selections, item.modifierGroups])

  const unitPrice = item.preco + selectedOptions.reduce((sum, o) => sum + o.preco_adicional, 0)
  const lineTotal = unitPrice * quantidade

  const missingRequired = item.modifierGroups.filter(
    (g) => g.tipo === 'obrigatorio' && (selections[g.id] ?? []).length === 0,
  )
  const canAdd = missingRequired.length === 0

  const countingSelected = item.modifierGroups
    .filter((g) => g.conta_para_limite)
    .reduce((sum, g) => sum + (selections[g.id] ?? []).length, 0)
  const atIngredientLimit = item.max_ingredientes != null && countingSelected >= item.max_ingredientes

  function toggleOption(groupId: string, optionId: string, selecao: 'unica' | 'multipla', countsTowardLimit: boolean) {
    setSelections((prev) => {
      const current = prev[groupId] ?? []
      if (selecao === 'unica') {
        return { ...prev, [groupId]: [optionId] }
      }
      const exists = current.includes(optionId)
      if (!exists && countsTowardLimit && atIngredientLimit) return prev
      return {
        ...prev,
        [groupId]: exists ? current.filter((id) => id !== optionId) : [...current, optionId],
      }
    })
  }

  function handleAdd() {
    if (!canAdd) return
    onAdd({
      cartId: crypto.randomUUID(),
      menuItem: item,
      quantidade,
      observacoes: observacoes.trim(),
      selectedOptions,
      unitPrice,
    })
  }

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
                {translateLabel(group.nome, lang)}
                <span className={`badge ${group.tipo === 'obrigatorio' ? 'badge--required' : 'badge--optional'}`}>
                  {group.tipo === 'obrigatorio' ? t('badgeRequired') : t('badgeOptional')}
                </span>
                {group.conta_para_limite && item.max_ingredientes != null && (
                  <span className="badge badge--counter">
                    {countingSelected} / {item.max_ingredientes}
                  </span>
                )}
              </legend>
              <div className="modal__options">
                {group.options.map((option) => {
                  const active = (selections[group.id] ?? []).includes(option.id)
                  const disabledByLimit = group.conta_para_limite && atIngredientLimit && !active
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`option-pill ${active ? 'option-pill--active' : ''}`}
                      disabled={disabledByLimit}
                      onClick={() => toggleOption(group.id, option.id, group.selecao, group.conta_para_limite)}
                    >
                      {translateLabel(option.nome, lang)}
                      {option.preco_adicional > 0 && (
                        <span className="option-pill__price">+{formatCHF(option.preco_adicional)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}

          <div className="modal__group">
            <label className="modal__group-title" htmlFor="observacoes">
              {t('observationLabel')}
            </label>
            <textarea
              id="observacoes"
              className="modal__textarea"
              placeholder={t('observationPlaceholder')}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="modal__qty">
            <span className="modal__group-title">{t('quantityLabel')}</span>
            <div className="stepper">
              <button
                className="stepper__btn"
                onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                aria-label={t('decreaseQty')}
              >
                <Minus size={18} strokeWidth={2.5} />
              </button>
              <span className="stepper__value">{quantidade}</span>
              <button
                className="stepper__btn"
                onClick={() => setQuantidade((q) => q + 1)}
                aria-label={t('increaseQty')}
              >
                <Plus size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        <div className="modal__footer">
          {!canAdd && (
            <p className="modal__warning">
              {t('selectOptionIn')}
              {missingRequired.map((g) => translateLabel(g.nome, lang)).join(', ')}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={!canAdd} onClick={handleAdd}>
            {t('addToCartPrefix')}
            {formatCHF(lineTotal)}
          </button>
        </div>
      </div>
    </div>
  )
}
