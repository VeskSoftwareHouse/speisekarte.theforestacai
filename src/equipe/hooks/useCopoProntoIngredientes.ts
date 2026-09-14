import { useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'

export interface IngredienteCopoPronto {
  option_id: string
  option_nome: string
  /** Nome do grupo de adicionais que essa opção pertence (ex: "Früchte") —
   * é o que deixa a comanda mostrar a receita do copo pronto categorizada
   * igual aos adicionais que o cliente escolhe na hora. */
  categoria: string
}

/**
 * Ingredientes do "copo pronto" de cada produto (ver menu_item_ingredientes e
 * MenuItem.copo_pronto), por menu_item_id — pra comanda mostrar a receita
 * fixa categorizada em vez do texto solto de order_items.descricao_item.
 * Carregado uma vez: a receita de um copo pronto muda raramente, não precisa
 * de Realtime na tela de pedidos (uma atualização recarrega na próxima vez
 * que o painel abrir).
 */
export function useCopoProntoIngredientes(): Record<string, IngredienteCopoPronto[]> {
  const [porProduto, setPorProduto] = useState<Record<string, IngredienteCopoPronto[]>>({})

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const [ligacoesRes, opcoesRes, gruposRes] = await Promise.all([
        supabase.from('menu_item_ingredientes').select('menu_item_id, modifier_option_id').order('ordem'),
        supabase.from('modifier_options').select('id, nome, modifier_id'),
        supabase.from('modifiers').select('id, nome'),
      ])
      if (cancelado) return
      if (ligacoesRes.error || opcoesRes.error || gruposRes.error) return

      const nomeGrupoPorId = new Map((gruposRes.data ?? []).map((g: { id: string; nome: string }) => [g.id, g.nome]))
      const opcaoPorId = new Map(
        (opcoesRes.data ?? []).map((o: { id: string; nome: string; modifier_id: string }) => [o.id, o]),
      )

      const proximo: Record<string, IngredienteCopoPronto[]> = {}
      for (const link of (ligacoesRes.data ?? []) as { menu_item_id: string; modifier_option_id: string }[]) {
        const opcao = opcaoPorId.get(link.modifier_option_id)
        if (!opcao) continue
        const categoria = nomeGrupoPorId.get(opcao.modifier_id) ?? ''
        ;(proximo[link.menu_item_id] ??= []).push({ option_id: opcao.id, option_nome: opcao.nome, categoria })
      }
      setPorProduto(proximo)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  return porProduto
}
