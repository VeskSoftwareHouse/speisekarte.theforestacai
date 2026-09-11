import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { Category, MenuItem, MenuItemInsumo } from '@shared/types'

/** Lançado ao tentar excluir uma categoria/produto que já apareceu em algum pedido (viola FK com order_items). */
export class DeleteBlockedError extends Error {
  constructor() {
    super('Não é possível excluir: já existe um pedido que referencia este item.')
    this.name = 'DeleteBlockedError'
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
  ordem: number
}

export function useMenuAdmin() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [compositionByItem, setCompositionByItem] = useState<Record<string, MenuItemInsumo[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [catsRes, itemsRes, compositionRes] = await retryLoad(
      () =>
        Promise.all([
          supabase.from('categories').select('*').order('ordem'),
          supabase.from('menu_items').select('*').order('ordem'),
          supabase.from('menu_item_insumos').select('*'),
        ]),
      ([c, i, comp]) => !!(c.error ?? i.error ?? comp.error),
    )
    const firstError = catsRes.error ?? itemsRes.error ?? compositionRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    const composition: Record<string, MenuItemInsumo[]> = {}
    for (const row of compositionRes.data ?? []) {
      ;(composition[row.menu_item_id] ??= []).push(row)
    }
    setCategories(catsRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setCompositionByItem(composition)
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

  /** Sobe uma imagem do cardápio (produto ou adicional) e devolve a URL pública. */
  async function uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: err } = await supabase.storage
      .from('menu-images')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (err) throw new Error(err.message)
    const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
    return data.publicUrl
  }

  return {
    categories,
    items,
    compositionByItem,
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    createProduct,
    updateProduct,
    deleteProduct,
    setProductComposition,
    uploadImage,
  }
}
