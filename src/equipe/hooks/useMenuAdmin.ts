import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { Category, MenuItem } from '@shared/types'

export interface CategoryInput {
  nome: string
  ordem: number
}

export interface ProductInput {
  categoria_id: string
  nome: string
  descricao: string
  preco: number
  foto_url: string | null
  disponivel: boolean
  ordem: number
}

export function useMenuAdmin() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [catsRes, itemsRes] = await Promise.all([
      supabase.from('categories').select('*').order('ordem'),
      supabase.from('menu_items').select('*').order('ordem'),
    ])
    const firstError = catsRes.error ?? itemsRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setCategories(catsRes.data ?? [])
    setItems(itemsRes.data ?? [])
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
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function createProduct(input: ProductInput) {
    const { error: err } = await supabase.from('menu_items').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateProduct(id: string, input: ProductInput) {
    const { error: err } = await supabase.from('menu_items').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteProduct(id: string) {
    const { error: err } = await supabase.from('menu_items').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function uploadProductImage(file: File): Promise<string> {
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
    loading,
    error,
    createCategory,
    updateCategory,
    deleteCategory,
    createProduct,
    updateProduct,
    deleteProduct,
    uploadProductImage,
  }
}
