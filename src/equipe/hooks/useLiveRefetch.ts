import { useEffect, useRef } from 'react'

/**
 * Rede de segurança do Realtime. O WebSocket do Supabase só entrega o que
 * acontece enquanto está conectado: tablet que dorme, wifi que oscila ou aba
 * em segundo plano perdem eventos, e a lib não os reenvia ao reconectar — o
 * pedido pago nesse intervalo só aparecia depois de alguém recarregar a
 * página. Por isso, além de reagir aos eventos, a tela rebusca sozinha:
 * periodicamente, ao voltar a ficar visível, ao recuperar a rede e quando
 * `refetchKey` muda (ex.: o canal voltou a ficar SUBSCRIBED).
 */
export function useLiveRefetch(refetch: () => void, intervalMs = 15_000, refetchKey?: unknown) {
  const latest = useRef(refetch)
  useEffect(() => {
    latest.current = refetch
  }, [refetch])

  useEffect(() => {
    const run = () => latest.current()
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') run()
    }, intervalMs)

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', run)
    window.addEventListener('focus', run)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run)
      window.removeEventListener('focus', run)
    }
  }, [intervalMs])

  // Reconexão do canal: recarrega o que pode ter passado enquanto estava fora.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (refetchKey) latest.current()
  }, [refetchKey])
}
