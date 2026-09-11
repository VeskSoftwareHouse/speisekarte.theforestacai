import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { Fornecedor } from '@shared/types'

export interface FornecedorInput {
  nome: string
  contato: string | null
  telefone: string | null
  email: string | null
  observacoes: string | null
  ativo: boolean
}

/**
 * Cadastro de fornecedores. Mesma forma dos outros painéis de
 * administração: carrega tudo uma vez e recarrega depois de cada escrita.
 */
export function useFornecedorAdmin() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () => supabase.from('fornecedores').select('*').order('nome'),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setFornecedores(data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createFornecedor(input: FornecedorInput) {
    const { error: err } = await supabase.from('fornecedores').insert(input)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function updateFornecedor(id: string, input: FornecedorInput) {
    const { error: err } = await supabase.from('fornecedores').update(input).eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  async function deleteFornecedor(id: string) {
    const { error: err } = await supabase.from('fornecedores').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { fornecedores, loading, error, createFornecedor, updateFornecedor, deleteFornecedor }
}
