import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { Imposto, ImpostoTipo } from '@shared/types'

export interface ImpostoInput {
  nome: string
  tipo: ImpostoTipo
  valor: number
  insumo_id: string | null
  ativo: boolean
}

/**
 * Cadastro de impostos. Mesma forma dos outros painéis de administração:
 * carrega tudo uma vez e recarrega depois de cada escrita.
 */
export function useImpostoAdmin() {
  const [impostos, setImpostos] = useState<Imposto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () => supabase.from('impostos').select('*').order('nome'),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setImpostos(data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createImposto(input: ImpostoInput) {
    const { error: err } = await supabase.from('impostos').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateImposto(id: string, input: ImpostoInput) {
    const { error: err } = await supabase.from('impostos').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteImposto(id: string) {
    const { error: err } = await supabase.from('impostos').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { impostos, loading, error, createImposto, updateImposto, deleteImposto }
}
