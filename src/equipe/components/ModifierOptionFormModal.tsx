import { useRef, useState } from 'react'
import { X, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import type { Insumo, Modifier, ModifierOption } from '@shared/types'
import CurrencyInput from '@shared/components/CurrencyInput'
import { UNIDADE_LABEL } from '@shared/unidadeLabel'
import { translationsFor } from '../autoTranslate'
import type { ModifierOptionInput } from '../hooks/useModifierAdmin'

interface Props {
  option: ModifierOption | null
  groups: Modifier[]
  defaultGroupId: string | null
  insumos: Insumo[]
  accessToken: string
  onClose: () => void
  onSave: (input: ModifierOptionInput) => Promise<void>
  onUploadImage: (file: File) => Promise<string>
}

export default function ModifierOptionFormModal({
  option,
  groups,
  defaultGroupId,
  insumos,
  accessToken,
  onClose,
  onSave,
  onUploadImage,
}: Props) {
  const [nome, setNome] = useState(option?.nome ?? '')
  const [modifierId, setModifierId] = useState(option?.modifier_id ?? defaultGroupId ?? groups[0]?.id ?? '')
  const [precoAdicional, setPrecoAdicional] = useState(option?.preco_adicional ?? 0)
  const [ordem, setOrdem] = useState(option?.ordem ?? 0)
  const [fotoUrl, setFotoUrl] = useState(option?.foto_url ?? '')
  const [insumoId, setInsumoId] = useState(option?.insumo_id ?? '')
  const [quantidadePadrao, setQuantidadePadrao] = useState(option?.quantidade_padrao ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      setFotoUrl(await onUploadImage(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !modifierId) return
    if (insumoId && !(Number(quantidadePadrao) > 0)) {
      setError('Informe uma quantidade maior que zero para o insumo vinculado.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { nome_i18n } = await translationsFor({ nome }, option, accessToken)
      await onSave({
        nome: nome.trim(),
        nome_i18n,
        modifier_id: modifierId,
        preco_adicional: precoAdicional,
        ordem,
        foto_url: fotoUrl.trim() || null,
        insumo_id: insumoId || null,
        quantidade_padrao: insumoId ? Number(quantidadePadrao) : null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal--sm" onClick={(e) => e.stopPropagation()}>
        <header className="admin-modal__header">
          <h2>{option ? 'Editar adicional' : 'Novo adicional'}</h2>
          <button className="admin-modal__close" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} />
          </button>
        </header>

        <form className="admin-form" onSubmit={handleSubmit}>
          <div className="admin-form__photo">
            <div className="admin-form__photo-preview">
              {fotoUrl ? <img src={fotoUrl} alt="" /> : <ImagePlus size={28} strokeWidth={1.5} aria-hidden />}
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
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Morango" required />
          </label>

          <p className="admin-form__hint">
            As traduções do nome são geradas automaticamente ao salvar.
          </p>

          <label className="admin-form__field">
            <span>Categoria de adicionais</span>
            <select value={modifierId} onChange={(e) => setModifierId(e.target.value)} required>
              {groups.length === 0 && <option value="">Nenhuma categoria cadastrada</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-form__row">
            <label className="admin-form__field">
              <span>Preço adicional (CHF)</span>
              <CurrencyInput value={precoAdicional} onChange={setPrecoAdicional} />
            </label>
            <label className="admin-form__field admin-form__field--sm">
              <span>Ordem</span>
              <input type="number" min={0} value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
            </label>
          </div>

          <label className="admin-form__field">
            <span>Insumo consumido (opcional)</span>
            <select value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
              <option value="">Nenhum — fora da baixa automática de estoque</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>

          {insumoId && (
            <label className="admin-form__field">
              <span>
                Quantidade padrão
                {(() => {
                  const u = insumos.find((i) => i.id === insumoId)?.unidade
                  return u ? ` (${UNIDADE_LABEL[u]})` : ''
                })()}
              </span>
              <input
                type="number"
                min={0}
                step="0.001"
                value={quantidadePadrao}
                onChange={(e) => setQuantidadePadrao(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 200"
                required
              />
              <p className="admin-form__hint">
                Consumido a cada vez que esta opção é escolhida (mesma unidade do insumo).
              </p>
            </label>
          )}

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving || uploading}>
            {saving ? 'Salvando…' : 'Salvar adicional'}
          </button>
        </form>
      </div>
    </div>
  )
}
