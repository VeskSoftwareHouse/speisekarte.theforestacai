import { useMemo, useState } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import type { MenuItemWithModifiers, ModifierGroup, ModifierOption, SelectedModifierOption } from '@shared/types'
import { formatCHF } from '@shared/format'
import { useLanguage } from '../i18n/LanguageContext'
import { translatedField } from '../i18n/menuTranslations'
import type { CartItem } from '../types'
import { optionPhoto, productPhoto } from '../photo'

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
  // optionId -> quantas porções dessa opção foram escolhidas. Sem entrada =
  // zero (não escolhida) — a maioria das opções tem no máximo 1 porção (ver
  // ModifierOption.quantidade_maxima), então isto substitui de cara o antigo
  // "conjunto de ids marcados" só quando a opção permite mais de uma.
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})

  const selectedOptions: SelectedModifierOption[] = useMemo(() => {
    const result: SelectedModifierOption[] = []
    for (const group of item.modifierGroups) {
      for (const option of group.options) {
        const qtd = quantidades[option.id] ?? 0
        if (qtd <= 0) continue
        result.push({
          modifier_id: group.id,
          modifier_nome: group.nome,
          option_id: option.id,
          option_nome: option.nome,
          option_nome_i18n: option.nome_i18n,
          preco_adicional: option.preco_adicional,
          quantidade: qtd,
        })
      }
    }
    return result
  }, [quantidades, item.modifierGroups])

  const unitPrice = item.preco + selectedOptions.reduce((sum, o) => sum + o.preco_adicional * o.quantidade, 0)
  const lineTotal = unitPrice * quantidade

  const missingRequired = item.modifierGroups.filter(
    (g) => g.tipo === 'obrigatorio' && !g.options.some((o) => (quantidades[o.id] ?? 0) > 0),
  )
  const canAdd = missingRequired.length === 0

  /**
   * Ajusta quantas porções de uma opção estão escolhidas (0 = desmarcada).
   * Seleção "única" zera as outras opções do mesmo grupo ao escolher uma nova
   * — cada opção continua podendo ter mais de uma porção se ela permitir
   * (ex: um grupo de seleção única "Quantas colheres de açúcar?" com uma
   * opção só, até 3 porções). O limite de opções DISTINTAS do grupo
   * (max_selecoes) só entra quando uma opção passa de zero pra alguma
   * quantidade — aumentar a quantidade de algo já escolhido nunca esbarra
   * nele, só no `quantidade_maxima` da própria opção.
   */
  function setOptionQuantidade(group: ModifierGroup, option: ModifierOption, bruta: number) {
    const maximo = option.quantidade_maxima ?? 1
    const nova = Math.max(0, Math.min(bruta, maximo))
    const atual = quantidades[option.id] ?? 0
    if (nova === atual) return

    if (group.selecao === 'multipla' && atual === 0 && nova > 0 && group.max_selecoes != null) {
      const distintas = group.options.filter((o) => (quantidades[o.id] ?? 0) > 0).length
      if (distintas >= group.max_selecoes) return
    }

    setQuantidades((prev) => {
      const next = { ...prev }
      if (group.selecao === 'unica' && nova > 0) {
        for (const o of group.options) delete next[o.id]
      }
      if (nova > 0) next[option.id] = nova
      else delete next[option.id]
      return next
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
          {item.foto_url && <img className="modal__photo" {...productPhoto(item.foto_url)} alt={nome} />}
          <h2 className="modal__title">{nome}</h2>
          {desc && <p className="modal__desc">{desc}</p>}
          <p className="modal__price">{formatCHF(item.preco)}</p>

          {item.modifierGroups.map((group) => {
            const distintasSelecionadas = group.options.filter((o) => (quantidades[o.id] ?? 0) > 0).length
            return (
              <fieldset key={group.id} className="modal__group">
                <legend className="modal__group-title">
                  {translatedField(group.nome_i18n, lang, group.nome)}
                  <span className={`badge ${group.tipo === 'obrigatorio' ? 'badge--required' : 'badge--optional'}`}>
                    {group.tipo === 'obrigatorio' ? t('badgeRequired') : t('badgeOptional')}
                  </span>
                  {group.max_selecoes != null && (
                    <span className="badge badge--counter">
                      {distintasSelecionadas} / {group.max_selecoes}
                    </span>
                  )}
                </legend>
                <div className="modal__options">
                  {group.options.map((option) => {
                    const qtd = quantidades[option.id] ?? 0
                    const maximo = option.quantidade_maxima ?? 1
                    const permiteVarias = maximo > 1
                    const disabledByLimit = qtd === 0 && group.max_selecoes != null && distintasSelecionadas >= group.max_selecoes

                    if (!permiteVarias) {
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`option-pill ${qtd > 0 ? 'option-pill--active' : ''}`}
                          disabled={disabledByLimit}
                          onClick={() => setOptionQuantidade(group, option, qtd > 0 ? 0 : 1)}
                        >
                          {option.foto_url && (
                            <img className="option-pill__photo" {...optionPhoto(option.foto_url)} alt="" loading="lazy" />
                          )}
                          {translatedField(option.nome_i18n, lang, option.nome)}
                          {option.preco_adicional > 0 && (
                            <span className="option-pill__price">+{formatCHF(option.preco_adicional)}</span>
                          )}
                        </button>
                      )
                    }

                    // Opção com mais de uma porção permitida (ex: "3x Granola"):
                    // o corpo da pílula adiciona a primeira porção; um contador
                    // +/- ajusta a partir daí, até quantidade_maxima.
                    return (
                      <div key={option.id} className={`option-pill option-pill--qty ${qtd > 0 ? 'option-pill--active' : ''}`}>
                        <button
                          type="button"
                          className="option-pill__body"
                          disabled={disabledByLimit}
                          onClick={() => setOptionQuantidade(group, option, qtd > 0 ? qtd : 1)}
                        >
                          {option.foto_url && (
                            <img className="option-pill__photo" {...optionPhoto(option.foto_url)} alt="" loading="lazy" />
                          )}
                          {translatedField(option.nome_i18n, lang, option.nome)}
                          {option.preco_adicional > 0 && (
                            <span className="option-pill__price">+{formatCHF(option.preco_adicional)}</span>
                          )}
                        </button>
                        <div className="option-pill__stepper">
                          {qtd > 0 && (
                            <button
                              type="button"
                              className="option-pill__stepper-btn"
                              onClick={() => setOptionQuantidade(group, option, qtd - 1)}
                              aria-label={t('decreaseQty')}
                            >
                              <Minus size={13} strokeWidth={2.5} />
                            </button>
                          )}
                          {qtd > 0 && <span className="option-pill__stepper-value">{qtd}</span>}
                          <button
                            type="button"
                            className="option-pill__stepper-btn"
                            disabled={qtd >= maximo || (qtd === 0 && disabledByLimit)}
                            onClick={() => setOptionQuantidade(group, option, qtd + 1)}
                            aria-label={t('increaseQty')}
                          >
                            <Plus size={13} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}

          <div className="modal__group">
            <label className="modal__group-title" htmlFor="observacoes">
              {t('observationLabel')}
            </label>
            <textarea
              id="observacoes"
              className="modal__textarea"
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
              {missingRequired.map((g) => translatedField(g.nome_i18n, lang, g.nome)).join(', ')}
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
