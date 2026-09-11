import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { MotivoPerda, Perda } from '@shared/types'

export interface PerdaManualInput {
  insumo_id: string
  quantidade: number
  motivo: MotivoPerda
  observacoes: string | null
}

/**
 * Perdas avulsas, lançadas fora de uma sessão de inventário (ex: staff
 * percebe um produto estragado no meio do dia). Diferente da perda que
 * nasce de um inventário — aqui não existe nenhum ajuste que já tenha
 * tirado o insumo do saldo, então `lancarPerdaManual` grava a perda E a
 * movimentação de saída juntas.
 */
export function usePerdasAdmin(currentUserId: string) {
  const [perdas, setPerdas] = useState<Perda[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () => supabase.from('perdas').select('*').order('criado_em', { ascending: false }),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setPerdas(data ?? [])
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function lancarPerdaManual(input: PerdaManualInput) {
    const { data: perda, error: err } = await supabase
      .from('perdas')
      .insert({ ...input, origem_tipo: 'manual', criado_por: currentUserId })
      .select()
      .single()
    if (err) throw new Error(err.message)

    const { error: movErr } = await supabase.from('movimentacoes_estoque').insert({
      insumo_id: input.insumo_id,
      quantidade: -input.quantidade,
      tipo: 'saida_perda',
      origem_tipo: 'perda',
      origem_id: perda.id,
      observacoes: input.observacoes,
      criado_por: currentUserId,
    })
    if (movErr) throw new Error(movErr.message)

    await fetchAll()
  }

  return { perdas, loading, error, lancarPerdaManual }
}
