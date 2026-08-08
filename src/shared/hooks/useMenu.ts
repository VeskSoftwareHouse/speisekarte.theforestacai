import { useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { Category, MenuItemWithModifiers, ModifierGroup } from '@shared/types'

interface MenuData {
  categories: Category[]
  itemsByCategory: Record<string, MenuItemWithModifiers[]>
  loading: boolean
  error: string | null
}

/** Carrega cardápio completo (categorias, itens disponíveis e seus grupos de modifier) em uma leva só. */
export function useMenu(): MenuData {
  const [categories, setCategories] = useState<Category[]>([])
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, MenuItemWithModifiers[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [catsRes, itemsRes, modsRes, optsRes, linksRes] = await Promise.all([
        supabase.from('categories').select('*').order('ordem'),
        supabase.from('menu_items').select('*').eq('disponivel', true).order('ordem'),
        supabase.from('modifiers').select('*'),
        supabase.from('modifier_options').select('*').order('ordem'),
        supabase.from('menu_item_modifiers').select('*'),
      ])

      if (cancelled) return

      const firstError = catsRes.error ?? itemsRes.error ?? modsRes.error ?? optsRes.error ?? linksRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const groupsById: Record<string, ModifierGroup> = {}
      for (const m of modsRes.data ?? []) {
        groupsById[m.id] = { ...m, options: [] }
      }
      for (const o of optsRes.data ?? []) {
        groupsById[o.modifier_id]?.options.push(o)
      }

      const groupsByItem: Record<string, ModifierGroup[]> = {}
      for (const link of linksRes.data ?? []) {
        const group = groupsById[link.modifier_id]
        if (!group) continue
        ;(groupsByItem[link.menu_item_id] ??= []).push(group)
      }

      const grouped: Record<string, MenuItemWithModifiers[]> = {}
      for (const item of itemsRes.data ?? []) {
        const withMods: MenuItemWithModifiers = { ...item, modifierGroups: groupsByItem[item.id] ?? [] }
        ;(grouped[item.categoria_id] ??= []).push(withMods)
      }

      setCategories(catsRes.data ?? [])
      setItemsByCategory(grouped)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { categories, itemsByCategory, loading, error }
}
