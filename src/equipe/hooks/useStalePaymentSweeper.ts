import { useEffect } from 'react'
import { supabase } from '@shared/supabaseClient'

/** O totem só espera o cartão por 2 min (TAP_TIMEOUT_MS em mesa/App.tsx). */
const GIVE_UP_AFTER_MS = 3 * 60_000
/** Depois disto o pedido é abandono, não vale mais perguntar à SumUp. */
const STOP_AFTER_MS = 30 * 60_000
const SWEEP_INTERVAL_MS = 30_000

/**
 * Quem move um pedido de cartão para `recebido` é o totem, perguntando à SumUp
 * enquanto a tela de espera está aberta. Se o totem desiste (2 min), recarrega,
 * dorme ou perde a rede antes do cliente aproximar o cartão, o pagamento
 * entra na SumUp mas o pedido fica para sempre em `aguardando_pagamento` —
 * cobrado e invisível para a cozinha. Esta varredura, rodando no painel,
 * reconsulta esses pedidos órfãos pelo mesmo endpoint que o totem usa.
 */
export function useStalePaymentSweeper(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let running = false

    const sweep = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        const now = Date.now()
        const { data } = await supabase
          .from('orders')
          .select('id')
          .eq('status', 'aguardando_pagamento')
          .lte('criado_em', new Date(now - GIVE_UP_AFTER_MS).toISOString())
          .gte('criado_em', new Date(now - STOP_AFTER_MS).toISOString())
        for (const { id } of (data ?? []) as { id: string }[]) {
          try {
            await fetch('/api/sumup-confirm-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: id }),
            })
          } catch {
            // Próxima varredura tenta de novo.
          }
        }
      } finally {
        running = false
      }
    }

    sweep()
    const id = setInterval(sweep, SWEEP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [enabled])
}
