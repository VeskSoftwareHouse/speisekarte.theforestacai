import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { Category, MenuItem, MenuItemIngrediente, MenuItemInsumo } from '@shared/types'
import { DeleteBlockedError } from './errors'

export { DeleteBlockedError }

/**
 * Maior card do cardápio tem 400px de altura (ver .item-card__photo em
 * mesa.css) — 1600px de lado maior cobre isso com folga até em tela retina
 * 3x. Fotos de celular chegam bem maiores que isso (e mais pesadas), o que
 * inflava o "cached egress" do Supabase: a mesma imagem enorme sendo servida
 * de novo a cada carregamento do totem.
 */
const MAX_IMAGE_DIMENSION = 1600
const JPEG_QUALITY = 0.82

/** Redimensiona/comprime no navegador antes do upload. Se algo falhar (ou a
 * imagem já for pequena o bastante), sobe o arquivo original sem travar o
 * cadastro — a otimização é bônus, não requisito. */
async function compressImage(file: File): Promise<File | Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

export interface CategoryInput {
  nome: string
  nome_i18n: Record<string, string>
  ordem: number
}

export interface ProductInput {
  categoria_id: string
  nome: string
  nome_i18n: Record<string, string>
  descricao: string
  descricao_i18n: Record<string, string>
  preco: number
  foto_url: string | null
  disponivel: boolean
  destaque: boolean
  descricao_na_comanda: boolean
  copo_pronto: boolean
  ordem: number
}

export function useMenuAdmin() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [compositionByItem, setCompositionByItem] = useState<Record<string, MenuItemInsumo[]>>({})
  const [ingredientesByItem, setIngredientesByItem] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [catsRes, itemsRes, compositionRes, ingredientesRes] = await retryLoad(
      () =>
        Promise.all([
          supabase.from('categories').select('*').order('ordem'),
          supabase.from('menu_items').select('*').order('ordem'),
          supabase.from('menu_item_insumos').select('*'),
          supabase.from('menu_item_ingredientes').select('*').order('ordem'),
        ]),
      ([c, i, comp, ing]) => !!(c.error ?? i.error ?? comp.error ?? ing.error),
    )
    const firstError = catsRes.error ?? itemsRes.error ?? compositionRes.error ?? ingredientesRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    const composition: Record<string, MenuItemInsumo[]> = {}
    for (const row of compositionRes.data ?? []) {
      ;(composition[row.menu_item_id] ??= []).push(row)
    }
    const ingredientes: Record<string, string[]> = {}
    for (const row of (ingredientesRes.data ?? []) as MenuItemIngrediente[]) {
      ;(ingredientes[row.menu_item_id] ??= []).push(row.modifier_option_id)
    }
    setCategories(catsRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setCompositionByItem(composition)
    setIngredientesByItem(ingredientes)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createCategory(input: CategoryInput) {
    const { error: err } = await supabase.from('categories').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateCategory(id: string, input: CategoryInput) {
    const { error: err } = await supabase.from('categories').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteCategory(id: string) {
    const { error: err } = await supabase.from('categories').delete().eq('id', id)
    if (err) {
      if (err.code === '23503') throw new DeleteBlockedError()
      throw new Error(err.message)
    }
    await fetchAll()
  }

  async function createProduct(input: ProductInput): Promise<MenuItem> {
    const { data, error: err } = await supabase.from('menu_items').insert(input).select().single()
    if (err) throw new Error(err.message)
    await fetchAll()
    return data
  }

  async function updateProduct(id: string, input: ProductInput) {
    const { error: err } = await supabase.from('menu_items').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteProduct(id: string) {
    const { error: err } = await supabase.from('menu_items').delete().eq('id', id)
    if (err) {
      if (err.code === '23503') throw new DeleteBlockedError()
      throw new Error(err.message)
    }
    await fetchAll()
  }

  /** Substitui a composição/receita fixa de um produto (ver menu_item_insumos). */
  async function setProductComposition(menuItemId: string, rows: { insumo_id: string; quantidade: number }[]) {
    const { error: delErr } = await supabase.from('menu_item_insumos').delete().eq('menu_item_id', menuItemId)
    if (delErr) throw new Error(delErr.message)
    if (rows.length > 0) {
      const { error: insErr } = await supabase
        .from('menu_item_insumos')
        .insert(rows.map((r) => ({ menu_item_id: menuItemId, insumo_id: r.insumo_id, quantidade: r.quantidade })))
      if (insErr) throw new Error(insErr.message)
    }
    await fetchAll()
  }

  /** Substitui a lista de ingredientes de um "copo pronto" (ver menu_item_ingredientes). */
  async function setProductIngredientes(menuItemId: string, optionIds: string[]) {
    const { error: delErr } = await supabase.from('menu_item_ingredientes').delete().eq('menu_item_id', menuItemId)
    if (delErr) throw new Error(delErr.message)
    if (optionIds.length > 0) {
      const { error: insErr } = await supabase.from('menu_item_ingredientes').insert(
        optionIds.map((modifier_option_id, ordem) => ({ menu_item_id: menuItemId, modifier_option_id, ordem })),
      )
      if (insErr) throw new Error(insErr.message)
    }
    await fetchAll()
  }

  /** Sobe uma imagem do cardápio (produto ou adicional) e devolve a URL pública. */
  async function uploadImage(file: File): Promise<string> {
    const upload = await compressImage(file)
    const ext = upload === file ? file.name.split('.').pop() || 'jpg' : 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: err } = await supabase.storage.from('menu-images').upload(path, upload, {
      // Um ano: o nome do arquivo é um UUID novo a cada upload (upsert:
      // false), então o conteúdo de uma URL nunca muda — não há risco de
      // servir uma versão velha em cache. Isso é o que reduz o "cached
      // egress" que estourou a cota do Supabase: o mesmo tablet fixo não
      // precisa mais rebaixar a mesma foto a cada hora.
      cacheControl: '31536000',
      upsert: false,
      contentType: upload === file ? file.type : 'image/jpeg',
    })
    if (err) throw new Error(err.message)
    const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
    return data.publicUrl
  }

  return {
    categories,
    items,
    compositionByItem,
    ingredientesByItem,
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    createProduct,
    updateProduct,
    deleteProduct,
    setProductComposition,
    setProductIngredientes,
    uploadImage,
  }
}
