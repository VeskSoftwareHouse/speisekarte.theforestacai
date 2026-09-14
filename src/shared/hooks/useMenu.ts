import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type {
  Category,
  MenuItem,
  MenuItemIngrediente,
  MenuItemModifier,
  MenuItemWithModifiers,
  Modifier,
  ModifierGroup,
  ModifierOption,
} from '@shared/types'

interface MenuData {
  categories: Category[]
  itemsByCategory: Record<string, MenuItemWithModifiers[]>
  loading: boolean
  error: string | null
}

const MENU_TABLES = [
  'categories',
  'menu_items',
  'modifiers',
  'modifier_options',
  'menu_item_modifiers',
  'menu_item_ingredientes',
] as const

/**
 * Esperas entre as tentativas de recarregar o cardápio. Existem porque falhas
 * passageiras acontecem — a mais notada foi "JWT issued at future", que vem do
 * próprio Supabase quando há diferença de relógio entre quem emite e quem valida
 * o token interno da requisição, e passa sozinha em segundos.
 *
 * Sem isto, um tropeço de um segundo deixava a mesa parada num aviso vermelho
 * até alguém recarregar a página na mão.
 */
const RETRY_DELAYS_MS = [400, 900, 2_000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  // Cada carga recebe um número. Se outra começar no meio — o Realtime dispara
  // recargas a cada edição no painel — a antiga se cala em vez de sobrescrever
  // dados mais novos.
  const generation = useRef(0)

  const load = useCallback(async () => {
    const mine = ++generation.current

    for (let attempt = 0; ; attempt++) {
      const [catsRes, itemsRes, modsRes, optsRes, linksRes, ingredientesRes] = await Promise.all([
        supabase.from('categories').select('*').order('ordem'),
        supabase.from('menu_items').select('*').eq('disponivel', true).order('ordem'),
        supabase.from('modifiers').select('*'),
        supabase.from('modifier_options').select('*').order('ordem'),
        supabase.from('menu_item_modifiers').select('*'),
        supabase.from('menu_item_ingredientes').select('*').order('ordem'),
      ])
      if (generation.current !== mine) return

      const firstError =
        catsRes.error ?? itemsRes.error ?? modsRes.error ?? optsRes.error ?? linksRes.error ?? ingredientesRes.error

      if (!firstError) {
        const { categories: cats, itemsByCategory: grouped } = assemble(
          (catsRes.data ?? []) as Category[],
          (itemsRes.data ?? []) as MenuItem[],
          (modsRes.data ?? []) as Modifier[],
          (optsRes.data ?? []) as ModifierOption[],
          (linksRes.data ?? []) as MenuItemModifier[],
          (ingredientesRes.data ?? []) as MenuItemIngrediente[],
        )
        setCategories(cats)
        setItemsByCategory(grouped)
        setError(null)
        setLoading(false)
        return
      }

      if (attempt >= RETRY_DELAYS_MS.length) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      // O erro não vai para a tela ainda: enquanto tenta de novo, a mesa segue
      // no "carregando" (ou com o cardápio anterior), sem piscar vermelho à toa.
      await sleep(RETRY_DELAYS_MS[attempt])
      if (generation.current !== mine) return
    }
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

/** Junta as seis tabelas cruas no formato que as telas consomem. */
function assemble(
  cats: Category[],
  items: MenuItem[],
  mods: Modifier[],
  opts: ModifierOption[],
  links: MenuItemModifier[],
  ingredienteLinks: MenuItemIngrediente[],
): { categories: Category[]; itemsByCategory: Record<string, MenuItemWithModifiers[]> } {
  const groupsById: Record<string, ModifierGroup> = {}
  for (const m of mods) {
    groupsById[m.id] = { ...m, options: [] }
  }
  const optionsById: Record<string, ModifierOption> = {}
  for (const o of opts) {
    groupsById[o.modifier_id]?.options.push(o)
    optionsById[o.id] = o
  }

  const groupsByItem: Record<string, ModifierGroup[]> = {}
  for (const link of links) {
    const group = groupsById[link.modifier_id]
    if (!group) continue
    ;(groupsByItem[link.menu_item_id] ??= []).push(group)
  }

  // Já vem ordenado por `ordem` da query — a posição escolhida no Painel da
  // Equipe pro copo pronto, não a ordem cadastrada do adicional.
  const ingredientesByItem: Record<string, ModifierOption[]> = {}
  for (const link of ingredienteLinks) {
    const option = optionsById[link.modifier_option_id]
    if (!option) continue
    ;(ingredientesByItem[link.menu_item_id] ??= []).push(option)
  }

  const itemsByCategory: Record<string, MenuItemWithModifiers[]> = {}
  for (const item of items) {
    const withMods: MenuItemWithModifiers = {
      ...item,
      modifierGroups: groupsByItem[item.id] ?? [],
      ingredientes: ingredientesByItem[item.id] ?? [],
    }
    ;(itemsByCategory[item.categoria_id] ??= []).push(withMods)
  }

  return { categories: cats, itemsByCategory }
}
