import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { retryLoad } from '@shared/retryLoad'
import type { InventarioItem, InventarioWithItens, MotivoPerda } from '@shared/types'

export interface InventarioItemInput {
  insumo_id: string
  saldo_sistema: number
  saldo_contado: number
  motivo: MotivoPerda | null
}

interface InventarioRow extends Omit<InventarioWithItens, 'itens'> {
  inventario_itens?: InventarioItem[]
}

/**
 * Sessões de inventário (contagem física). Sem rascunho: a equipe conta os
 * insumos que quiser e confirma tudo de uma vez —
 * `criarEFinalizarInventario` grava a sessão, gera as movimentações de
 * ajuste para cada diferença, e cria um registro de perda para cada
 * diferença negativa (faltou estoque).
 */
export function useInventarioAdmin(currentUserId: string) {
  const [inventarios, setInventarios] = useState<InventarioWithItens[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await retryLoad(
      () => supabase.from('inventarios').select('*, inventario_itens(*)').order('criado_em', { ascending: false }),
      (r) => !!r.error,
    )
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setInventarios(
      ((data ?? []) as InventarioRow[]).map(({ inventario_itens, ...inv }) => ({
        ...inv,
        itens: inventario_itens ?? [],
      })),
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function criarEFinalizarInventario(observacoes: string | null, itens: InventarioItemInput[]) {
    const { data: inventario, error: err } = await supabase
      .from('inventarios')
      .insert({ observacoes, criado_por: currentUserId })
      .select()
      .single()
    if (err) throw new Error(err.message)

    if (itens.length > 0) {
      const { error: itemsErr } = await supabase
        .from('inventario_itens')
        .insert(itens.map((it) => ({ ...it, inventario_id: inventario.id })))
      if (itemsErr) {
        await supabase.from('inventarios').delete().eq('id', inventario.id)
        throw new Error(itemsErr.message)
      }
    }

    const comDiferenca = itens.filter((it) => it.saldo_contado !== it.saldo_sistema)
    if (comDiferenca.length > 0) {
      const { error: movErr } = await supabase.from('movimentacoes_estoque').insert(
        comDiferenca.map((it) => {
          const diferenca = it.saldo_contado - it.saldo_sistema
          return {
            insumo_id: it.insumo_id,
            quantidade: diferenca,
            tipo: diferenca > 0 ? ('entrada_ajuste_inventario' as const) : ('saida_ajuste_inventario' as const),
            origem_tipo: 'inventario',
            origem_id: inventario.id,
            criado_por: currentUserId,
          }
        }),
      )
      if (movErr) throw new Error(movErr.message)
    }

    const faltantes = itens.filter((it) => it.saldo_contado < it.saldo_sistema)
    if (faltantes.length > 0) {
      const { error: perdaErr } = await supabase.from('perdas').insert(
        faltantes.map((it) => ({
          insumo_id: it.insumo_id,
          quantidade: it.saldo_sistema - it.saldo_contado,
          motivo: it.motivo as MotivoPerda,
          origem_tipo: 'inventario' as const,
          origem_id: inventario.id,
          criado_por: currentUserId,
        })),
      )
      if (perdaErr) throw new Error(perdaErr.message)
    }

    const { error: finErr } = await supabase
      .from('inventarios')
      .update({ finalizado_em: new Date().toISOString() })
      .eq('id', inventario.id)
    if (finErr) throw new Error(finErr.message)
    await fetchAll()
  }

  async function deleteInventario(id: string) {
    const { error: err } = await supabase.from('inventarios').delete().eq('id', id)
    if (err) throw new Error(err.message)
    await fetchAll()
  }

  return { inventarios, loading, error, criarEFinalizarInventario, deleteInventario }
}
