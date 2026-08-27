import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { TipOption, TipTipo } from '@shared/types'

export interface TipOptionInput {
  tipo: TipTipo
  valor: number
  ordem: number
  ativo: boolean
}

/**
 * Gestão das opções de gorjeta do totem. Mesma forma dos outros painéis de
 * administração: carrega tudo uma vez e recarrega depois de cada escrita, que
 * a esta escala custa menos do que manter um cache coerente na mão.
 */
export function useTipAdmin() {
  const [tips, setTips] = useState<TipOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.from('tip_options').select('*').order('ordem')
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setTips(data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createTip(input: TipOptionInput) {
    const { error: err } = await supabase.from('tip_options').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateTip(id: string, input: TipOptionInput) {
    const { error: err } = await supabase.from('tip_options').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteTip(id: string) {
    const { error: err } = await supabase.from('tip_options').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  /**
   * Liga e desliga sem apagar. Uma opção desligada some do totem mas continua
   * aqui — é como se tira a gorjeta de 20 francos de dezembro sem perder a
   * configuração dela.
   */
  async function toggleTip(id: string, ativo: boolean) {
    const { error: err } = await supabase.from('tip_options').update({ ativo }).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { tips, loading, error, createTip, updateTip, deleteTip, toggleTip, reload: fetchAll }
}
