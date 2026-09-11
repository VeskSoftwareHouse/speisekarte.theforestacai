import { useRef, useState } from 'react'
import { X, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import type { Category, Insumo, MenuItem, MenuItemInsumo, Modifier } from '@shared/types'
import CurrencyInput from '@shared/components/CurrencyInput'
import { translationsFor } from '../autoTranslate'
import type { ProductInput } from '../hooks/useMenuAdmin'

interface CompositionRow {
  insumo_id: string
  quantidade: number
}

interface Props {
  product: MenuItem | null
  categories: Category[]
  defaultCategoryId: string | null
  modifierGroups: Modifier[]
  linkedModifierIds: string[]
  insumos: Insumo[]
  composition: MenuItemInsumo[]
  accessToken: string
  onClose: () => void
  onSave: (input: ProductInput, modifierIds: string[], composition: CompositionRow[]) => Promise<void>
  onUploadImage: (file: File) => Promise<string>
}

export default function ProductFormModal({
  product,
  categories,
  defaultCategoryId,
  modifierGroups,
  linkedModifierIds,
  insumos,
  composition,
  accessToken,
  onClose,
  onSave,
  onUploadImage,
}: Props) {
  const [nome, setNome] = useState(product?.nome ?? '')
  const [categoriaId, setCategoriaId] = useState(product?.categoria_id ?? defaultCategoryId ?? categories[0]?.id ?? '')
  const [descricao, setDescricao] = useState(product?.descricao ?? '')
  const [preco, setPreco] = useState(product?.preco ?? 0)
  const [disponivel, setDisponivel] = useState(product?.disponivel ?? true)
  const [destaque, setDestaque] = useState(product?.destaque ?? false)
  const [descricaoNaComanda, setDescricaoNaComanda] = useState(product?.descricao_na_comanda ?? false)
  const [ordem, setOrdem] = useState(product?.ordem ?? 0)
  const [fotoUrl, setFotoUrl] = useState(product?.foto_url ?? '')
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>(linkedModifierIds)
  const [compositionRows, setCompositionRows] = useState<CompositionRow[]>(
    composition.map((c) => ({ insumo_id: c.insumo_id, quantidade: c.quantidade })),
  )
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function addCompositionRow() {
    const used = new Set(compositionRows.map((r) => r.insumo_id))
    const next = insumos.find((i) => !used.has(i.id))
    if (!next) return
    setCompositionRows((prev) => [...prev, { insumo_id: next.id, quantidade: 0 }])
  }

  function updateCompositionRow(idx: number, patch: Partial<CompositionRow>) {
    setCompositionRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function removeCompositionRow(idx: number) {
    setCompositionRows((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await onUploadImage(file)
      setFotoUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !categoriaId) return
    if (compositionRows.some((r) => !r.insumo_id || !(r.quantidade > 0))) {
      setError('Toda linha da composição precisa de um insumo e uma quantidade maior que zero.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { nome_i18n, descricao_i18n } = await translationsFor(
        { nome, descricao },
        product,
        accessToken,
      )
      await onSave(
        {
          nome: nome.trim(),
          nome_i18n,
          categoria_id: categoriaId,
          descricao: descricao.trim(),
          descricao_i18n,
          preco,
          foto_url: fotoUrl.trim() || null,
          disponivel,
          destaque,
          descricao_na_comanda: descricaoNaComanda,
          ordem,
        },
        selectedModifierIds,
        compositionRows,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal__header">
          <h2>{product ? 'Editar produto' : 'Novo produto'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form admin-form--scroll" onSubmit={handleSubmit}>
          <div className="admin-form__photo">
            <div className="admin-form__photo-preview">
              {fotoUrl ? (
                <img src={fotoUrl} alt="" />
              ) : (
                <ImagePlus size={28} strokeWidth={1.5} aria-hidden />
              )}
              {fotoUrl && (
                <button
                  type="button"
                  className="admin-form__photo-remove"
                  onClick={() => setFotoUrl('')}
                  aria-label="Excluir imagem"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              )}
            </div>
            <div className="admin-form__photo-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="admin-spin" aria-hidden /> Enviando…
                  </>
                ) : (
                  'Enviar imagem'
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="visually-hidden"
              />
            </div>
          </div>

          <label className="admin-form__field">
            <span>Nome (alemão)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Açaí 300 ml" required />
          </label>

          <label className="admin-form__field">
            <span>Categoria</span>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              {categories.length === 0 && <option value="">Nenhuma categoria cadastrada</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-form__field">
            <span>Descrição (alemão)</span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder="Descrição que aparece no cardápio"
            />
          </label>

          <label className="admin-form__checkbox">
            <input
              type="checkbox"
              checked={descricaoNaComanda}
              onChange={(e) => setDescricaoNaComanda(e.target.checked)}
            />
            <span>Enviar descrição na comanda do pedido</span>
          </label>

          <p className="admin-form__hint">
            As traduções para francês, italiano, inglês, português e espanhol são geradas
            automaticamente ao salvar.
          </p>

          <div className="admin-form__row">
            <label className="admin-form__field">
              <span>Preço (CHF)</span>
              <CurrencyInput value={preco} onChange={setPreco} required />
            </label>
            <label className="admin-form__field admin-form__field--sm">
              <span>Ordem</span>
              <input type="number" min={0} value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
            </label>
          </div>

          <label className="admin-form__checkbox">
            <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} />
            <span>Disponível no cardápio</span>
          </label>

          <label className="admin-form__checkbox">
            <input type="checkbox" checked={destaque} onChange={(e) => setDestaque(e.target.checked)} />
            <span>Destaque (aparece na página de Destaques)</span>
          </label>

          <div className="admin-form__field">
            <span>Adicionais deste produto</span>
            {modifierGroups.length === 0 && (
              <p className="admin-form__hint">Nenhuma categoria de adicionais cadastrada ainda.</p>
            )}
            <div className="admin-modifier-checklist">
              {modifierGroups.map((g) => {
                const checked = selectedModifierIds.includes(g.id)
                return (
                  <label key={g.id} className="admin-modifier-checklist__item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedModifierIds((prev) =>
                          checked ? prev.filter((id) => id !== g.id) : [...prev, g.id],
                        )
                      }
                    />
                    <span>{g.nome}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="admin-form__field">
            <span>Composição (receita fixa, consumida em toda venda)</span>
            {insumos.length === 0 && (
              <p className="admin-form__hint">
                Nenhum insumo cadastrado ainda — cadastre em Estoque → Insumos para poder ligar uma receita aqui.
              </p>
            )}
            {insumos.length > 0 && (
              <div className="admin-composition-list">
                {compositionRows.map((row, idx) => {
                  const insumo = insumos.find((i) => i.id === row.insumo_id)
                  return (
                    <div key={idx} className="admin-composition-list__row">
                      <select
                        value={row.insumo_id}
                        onChange={(e) => updateCompositionRow(idx, { insumo_id: e.target.value })}
                      >
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nome}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={row.quantidade || ''}
                        onChange={(e) => updateCompositionRow(idx, { quantidade: Number(e.target.value) })}
                        placeholder="0"
                      />
                      <span>{insumo?.unidade ?? ''}</span>
                      <button
                        type="button"
                        className="admin-composition-list__remove"
                        onClick={() => removeCompositionRow(idx)}
                        aria-label="Remover insumo da composição"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {insumos.length > compositionRows.length && (
              <button type="button" className="btn btn-outline" onClick={addCompositionRow}>
                + Adicionar insumo
              </button>
            )}
          </div>

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving || uploading}>
            {saving ? 'Salvando…' : 'Salvar produto'}
          </button>
        </form>
      </div>
    </div>
  )
}
