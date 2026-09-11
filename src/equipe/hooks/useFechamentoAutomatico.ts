import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { definirFechamentoAutomatico, fechamentoAutomaticoAtivo } from '../estoqueConsumo'

/** Interruptor do painel de Fechamento: liga/desliga a baixa automática de
 * estoque assim que um pedido é confirmado, em vez de esperar a revisão
 * manual em lote. */
export function useFechamentoAutomatico() {
  const [ativo, setAtivo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    fechamentoAutomaticoAtivo(supabase)
      .then((v) => {
        if (!cancelado) setAtivo(v)
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  const alternar = useCallback(async (novoValor: boolean) => {
    setAtivo(novoValor)
    try {
      await definirFechamentoAutomatico(supabase, novoValor)
    } catch {
      setAtivo(!novoValor)
    }
  }, [])

  return { ativo, loading, alternar }
}
