import { useEffect } from 'react'

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

/**
 * Mantém o app em tela cheia (sem barra de status/navegação do tablet).
 * O manifest já pede `display: fullscreen`, mas isso só vale para o app
 * instalado (WebAPK) e pode demorar a atualizar num tablet que já instalou
 * a versão antiga. Pedir fullscreen via JS a cada toque cobre esse caso e
 * também recupera o modo caso o sistema operacional o interrompa.
 */
export function useKeepFullscreen() {
  useEffect(() => {
    function requestFullscreen() {
      if (document.fullscreenElement) return
      const el = document.documentElement as FullscreenElement
      try {
        const result = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.()
        if (result && typeof result.then === 'function') {
          result.catch(() => {
            /* ambiente não aceitou o gesto — tenta de novo no próximo toque */
          })
        }
      } catch {
        /* API indisponível neste navegador — ignora */
      }
    }

    requestFullscreen()
    document.addEventListener('click', requestFullscreen)
    document.addEventListener('touchend', requestFullscreen)
    return () => {
      document.removeEventListener('click', requestFullscreen)
      document.removeEventListener('touchend', requestFullscreen)
    }
  }, [])
}
