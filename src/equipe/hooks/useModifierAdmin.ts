import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { Modifier, ModifierOption, ModifierSelecao, ModifierTipo } from '@shared/types'

export interface ModifierGroupInput {
  nome: string
  nome_i18n: Record<string, string>
  tipo: ModifierTipo
  selecao: ModifierSelecao
  conta_para_limite: boolean
  max_selecoes: number | null
}

export interface ModifierOptionInput {
  modifier_id: string
  nome: string
  nome_i18n: Record<string, string>
  preco_adicional: number
  ordem: number
  foto_url: string | null
  /** Insumo consumido quando esta opção é escolhida. null = fora da baixa automática de estoque. */
  insumo_id: string | null
  /** Quanto desse insumo é consumido por unidade do item, na unidade do próprio insumo. null quando `insumo_id` é null. */
  quantidade_padrao: number | null
  /** Quantas porções desta opção o cliente pode pedir de uma vez (ex: "3x Granola").
   * null ou 1 = só dá pra marcar/desmarcar; um valor maior mostra um contador no totem. */
  quantidade_maxima: number | null
}

export function useModifierAdmin() {
  const [groups, setGroups] = useState<Modifier[]>([])
  const [options, setOptions] = useState<ModifierOption[]>([])
  const [linksByItem, setLinksByItem] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [groupsRes, optionsRes, linksRes] = await retryLoad(
      () =>
        Promise.all([
          supabase.from('modifiers').select('*').order('nome'),
          supabase.from('modifier_options').select('*').order('ordem'),
          supabase.from('menu_item_modifiers').select('*'),
        ]),
      ([g, o, l]) => !!(g.error ?? o.error ?? l.error),
    )
    const firstError = groupsRes.error ?? optionsRes.error ?? linksRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    const links: Record<string, string[]> = {}
    for (const l of linksRes.data ?? []) {
      ;(links[l.menu_item_id] ??= []).push(l.modifier_id)
    }
    setGroups(groupsRes.data ?? [])
    setOptions(optionsRes.data ?? [])
    setLinksByItem(links)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createGroup(input: ModifierGroupInput) {
    const { error: err } = await supabase.from('modifiers').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateGroup(id: string, input: ModifierGroupInput) {
    const { error: err } = await supabase.from('modifiers').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteGroup(id: string) {
    const { error: err } = await supabase.from('modifiers').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function createOption(input: ModifierOptionInput) {
    const { error: err } = await supabase.from('modifier_options').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateOption(id: string, input: ModifierOptionInput) {
    const { error: err } = await supabase.from('modifier_options').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteOption(id: string) {
    const { error: err } = await supabase.from('modifier_options').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  /** Substitui o conjunto de grupos de modifier associados a um produto. */
  async function setProductModifiers(menuItemId: string, modifierIds: string[]) {
    const { error: delErr } = await supabase.from('menu_item_modifiers').delete().eq('menu_item_id', menuItemId)
    if (delErr) throw new Error(delErr.message)
    if (modifierIds.length > 0) {
      const { error: insErr } = await supabase
        .from('menu_item_modifiers')
        .insert(modifierIds.map((modifier_id) => ({ menu_item_id: menuItemId, modifier_id })))
      if (insErr) throw new Error(insErr.message)
    }
    await fetchAll()
  }

  return {
    groups,
    options,
    linksByItem,
    loading,
    error,
    createGroup,
    updateGroup,
    deleteGroup,
    createOption,
    updateOption,
    deleteOption,
    setProductModifiers,
  }
}
