import { useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { TipOption } from '@shared/types'

/**
 * Opções de gorjeta que o totem oferece, vindas do Painel da Equipe.
 *
 * Escuta o Realtime como o cardápio faz: mudar a gorjeta no painel reflete no
 * totem sem precisar recarregar o tablet, que fica ligado o dia inteiro.
 *
 * Falha de rede devolve lista vazia de propósito. Sem opções, o resumo do
 * pedido mostra só "Sem gorjeta" e a venda continua — gorjeta é um extra, e
 * não pode ser o que impede alguém de comprar um açaí.
 */
export function useTipOptions(): TipOption[] {
  const [tips, setTips] = useState<TipOption[]>([])

  useEffect(() => {
    let vivo = true

    async function carregar() {
      const { data } = await supabase
        .from('tip_options')
        .select('*')
        .eq('ativo', true)
        .order('ordem')
      if (vivo) setTips(data ?? [])
    }

    carregar()

    const channel = supabase
      .channel('mesa-tip-options')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_options' }, carregar)
      .subscribe()

    return () => {
      vivo = false
      supabase.removeChannel(channel)
    }
  }, [])

  return tips
}
