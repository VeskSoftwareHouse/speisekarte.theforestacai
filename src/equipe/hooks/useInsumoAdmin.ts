import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { Insumo, Unidade } from '@shared/types'

export interface InsumoInput {
  nome: string
  unidade: Unidade
  estoque_minimo: number | null
  gramas_por_litro: number | null
  ativo: boolean
  ordem: number
}

/**
 * Cadastro de insumos (ingredientes/matérias-primas controladas em
 * estoque). Mesma forma dos outros painéis de administração: carrega tudo
 * uma vez e recarrega depois de cada escrita.
 */
export function useInsumoAdmin() {
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () => supabase.from('insumos').select('*').order('ordem'),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setInsumos(data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createInsumo(input: InsumoInput) {
    const { error: err } = await supabase.from('insumos').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateInsumo(id: string, input: InsumoInput) {
    const { error: err } = await supabase.from('insumos').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteInsumo(id: string) {
    const { error: err } = await supabase.from('insumos').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { insumos, loading, error, createInsumo, updateInsumo, deleteInsumo }
}
