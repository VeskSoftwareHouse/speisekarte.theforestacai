import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { MovimentacaoEstoque, MovimentacaoTipo } from '@shared/types'

/** Histórico completo caberia mal numa tela só — as mais recentes bastam para o dia a dia. */
const MOVIMENTOS_LIMIT = 200

export interface MovimentoManualInput {
  insumo_id: string
  /** A UI só pede o valor absoluto; a direção decide o sinal gravado. */
  direcao: 'entrada' | 'saida'
  quantidade: number
  observacoes: string | null
}

/**
 * Histórico de movimentações de estoque + saldo atual por insumo (view
 * `insumo_saldos`, soma de todas as movimentações — nunca uma coluna
 * cacheada, ver comentário em schema.sql).
 */
export function useEstoqueMovimentos(currentUserId: string) {
  const [movimentos, setMovimentos] = useState<MovimentacaoEstoque[]>([])
  const [saldoPorInsumo, setSaldoPorInsumo] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [movRes, saldoRes] = await retryLoad(
      () =>
        Promise.all([
          supabase
            .from('movimentacoes_estoque')
            .select('*')
            .order('criado_em', { ascending: false })
            .limit(MOVIMENTOS_LIMIT),
          supabase.from('insumo_saldos').select('*'),
        ]),
      ([m, s]) => !!(m.error ?? s.error),
    )
    const firstError = movRes.error ?? saldoRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    const saldos: Record<string, number> = {}
    for (const row of saldoRes.data ?? []) saldos[row.insumo_id] = row.saldo_atual
    setMovimentos(movRes.data ?? [])
    setSaldoPorInsumo(saldos)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function lancarMovimentoManual(input: MovimentoManualInput) {
    const tipo: MovimentacaoTipo = input.direcao === 'entrada' ? 'entrada_manual' : 'saida_manual'
    const quantidade = input.direcao === 'entrada' ? input.quantidade : -input.quantidade
    const { error: err } = await supabase.from('movimentacoes_estoque').insert({
      insumo_id: input.insumo_id,
      quantidade,
      tipo,
      observacoes: input.observacoes,
      criado_por: currentUserId,
    })
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { movimentos, saldoPorInsumo, loading, error, lancarMovimentoManual, reload: fetchAll }
}
