import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { Category, MenuItemWithModifiers, ModifierGroup } from '@shared/types'

interface MenuData {
  categories: Category[]
  itemsByCategory: Record<string, MenuItemWithModifiers[]>
  loading: boolean
  error: string | null
}

const MENU_TABLES = ['categories', 'menu_items', 'modifiers', 'modifier_options', 'menu_item_modifiers'] as const

/**
 * Carrega cardápio completo (categorias, itens disponíveis e seus grupos de
 * modifier) em uma leva só, e mantém tudo sincronizado via Supabase Realtime:
 * qualquer edição feita no Painel da Equipe reflete aqui sem precisar recarregar.
 */
export function useMenu(): MenuData {
  const [categories, setCategories] = useState<Category[]>([])
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, MenuItemWithModifiers[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [catsRes, itemsRes, modsRes, optsRes, linksRes] = await Promise.all([
      supabase.from('categories').select('*').order('ordem'),
      supabase.from('menu_items').select('*').eq('disponivel', true).order('ordem'),
      supabase.from('modifiers').select('*'),
      supabase.from('modifier_options').select('*').order('ordem'),
      supabase.from('menu_item_modifiers').select('*'),
    ])

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
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()

    let channel = supabase.channel('mesa-menu-realtime')
    for (const table of MENU_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => load())
    }
    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  return { categories, itemsByCategory, loading, error }
}
