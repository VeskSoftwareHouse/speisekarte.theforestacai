import { useRef, useState } from 'react'
import { X, ImagePlus, Loader2 } from 'lucide-react'
import type { Category, MenuItem } from '@shared/types'
import CurrencyInput from '@shared/components/CurrencyInput'
import type { ProductInput } from '../hooks/useMenuAdmin'

const TRANSLATION_LANGS: { code: string; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'it', label: 'IT' },
  { code: 'en', label: 'EN' },
  { code: 'pt', label: 'PT' },
  { code: 'es', label: 'ES' },
]

interface Props {
  product: MenuItem | null
  categories: Category[]
  defaultCategoryId: string | null
  onClose: () => void
  onSave: (input: ProductInput) => Promise<void>
  onUploadImage: (file: File) => Promise<string>
}

export default function ProductFormModal({
  product,
  categories,
  defaultCategoryId,
  onClose,
  onSave,
  onUploadImage,
}: Props) {
  const [nome, setNome] = useState(product?.nome ?? '')
  const [nomeI18n, setNomeI18n] = useState<Record<string, string>>(product?.nome_i18n ?? {})
  const [categoriaId, setCategoriaId] = useState(product?.categoria_id ?? defaultCategoryId ?? categories[0]?.id ?? '')
  const [descricao, setDescricao] = useState(product?.descricao ?? '')
  const [descricaoI18n, setDescricaoI18n] = useState<Record<string, string>>(product?.descricao_i18n ?? {})
  const [activeLang, setActiveLang] = useState(TRANSLATION_LANGS[0].code)
  const [preco, setPreco] = useState(product?.preco ?? 0)
  const [disponivel, setDisponivel] = useState(product?.disponivel ?? true)
  const [ordem, setOrdem] = useState(product?.ordem ?? 0)
  const [fotoUrl, setFotoUrl] = useState(product?.foto_url ?? '')
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
    setSaving(true)
    setError(null)
    try {
      const cleanI18n = (obj: Record<string, string>) =>
        Object.fromEntries(Object.entries(obj).filter(([, v]) => v.trim()))
      await onSave({
        nome: nome.trim(),
        nome_i18n: cleanI18n(nomeI18n),
        categoria_id: categoriaId,
        descricao: descricao.trim(),
        descricao_i18n: cleanI18n(descricaoI18n),
        preco,
        foto_url: fotoUrl.trim() || null,
        disponivel,
        ordem,
      })
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
              <input
                className="admin-form__photo-url"
                value={fotoUrl}
                onChange={(e) => setFotoUrl(e.target.value)}
                placeholder="ou cole a URL de uma imagem"
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

          <div className="admin-form__field">
            <span>Traduções</span>
            <div className="admin-lang-tabs">
              {TRANSLATION_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`admin-lang-tab ${activeLang === l.code ? 'admin-lang-tab--active' : ''} ${
                    nomeI18n[l.code]?.trim() || descricaoI18n[l.code]?.trim() ? 'admin-lang-tab--filled' : ''
                  }`}
                  onClick={() => setActiveLang(l.code)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <input
              value={nomeI18n[activeLang] ?? ''}
              onChange={(e) => setNomeI18n((prev) => ({ ...prev, [activeLang]: e.target.value }))}
              placeholder="Nome — deixe em branco para usar o alemão"
            />
            <textarea
              value={descricaoI18n[activeLang] ?? ''}
              onChange={(e) => setDescricaoI18n((prev) => ({ ...prev, [activeLang]: e.target.value }))}
              rows={2}
              placeholder="Descrição — deixe em branco para usar o alemão"
            />
          </div>

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

          {error && <p className="admin-form__error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={saving || uploading}>
            {saving ? 'Salvando…' : 'Salvar produto'}
          </button>
        </form>
      </div>
    </div>
  )
}
