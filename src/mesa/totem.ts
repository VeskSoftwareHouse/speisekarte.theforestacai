/**
 * Modo totem: telas grandes em pé (monitor vertical, quiosque).
 *
 * Esses aparelhos costumam ampliar a interface (1,5x, 2x), e aí o navegador
 * enxerga uma tela de 1080 px físicos como 540–720 px "lógicos" e cai no layout
 * de celular. Com o modo ligado, o viewport passa a ter 1080 px fixos e o
 * navegador encolhe a página para caber: entra o layout de totem do mesa.css
 * (o bloco "Telas grandes em pé"), igual ao de um monitor 1080x1920 sem zoom.
 *
 * Liga com ?totem=1 na URL e fica guardado no aparelho; ?totem=0 desliga.
 * Precisa ser opt-in: um tablet em pé nas mesas não deve virar totem.
 *
 * Funciona em navegadores que respeitam a meta viewport (Android, iPad e
 * quiosques baseados neles). Chrome de desktop a ignora; num PC com Windows,
 * a saída é deixar a escala de exibição do sistema em 100%.
 */

export const TOTEM_WIDTH = 1080

/**
 * Quem decide se é totem é o script inline do mesa/index.html (roda antes da
 * primeira pintura): ?totem=1 / ?totem=0, o que ficou guardado, ou o modelo do
 * painel. Aqui só reforça a meta viewport caso o atributo já esteja posto.
 */
export function applyTotemMode() {
  if (!document.documentElement.hasAttribute('data-totem')) return
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (meta) {
    meta.content = `width=${TOTEM_WIDTH}, user-scalable=no, viewport-fit=cover`
  }
  keepTotemScale()
}

/**
 * Em tela cheia o Chrome do Android ignora a meta viewport e volta à largura do
 * aparelho (no iiyama, ~720 px em vez de 1080). Aí a página é reduzida com
 * `zoom` para continuar montada como se tivesse 1080 px — o layout de totem
 * do mesa.css não depende de largura (usa html[data-totem]), só precisava do
 * espaço. Fora da tela cheia a meta viewport já entrega 1080 e o zoom some.
 */
function keepTotemScale() {
  const root = document.documentElement
  const fit = () => {
    // Mede sem o zoom atual, para não se basear no próprio ajuste.
    const width = window.innerWidth
    if (width > 0 && width < TOTEM_WIDTH - 20) {
      root.style.setProperty('zoom', String(width / TOTEM_WIDTH))
    } else {
      root.style.removeProperty('zoom')
    }
  }
  fit()
  window.addEventListener('resize', fit)
  document.addEventListener('fullscreenchange', fit)
  document.addEventListener('webkitfullscreenchange', fit)
}

/**
 * ?diag=1 mostra uma caixinha com o que o navegador do aparelho enxerga:
 * versão do motor, tamanho de tela em px "lógicos", densidade, modo totem e
 * quadros por segundo. Serve para diagnosticar painéis com navegador embutido
 * sem precisar de cabo nem de ferramenta de desenvolvedor.
 */
export function showDiagnostics() {
  if (!/[?&]diag=1/.test(window.location.search)) return
  const box = document.createElement('pre')
  box.setAttribute(
    'style',
    'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;margin:0;padding:12px;' +
      'background:rgba(0,0,0,.85);color:#7CFC9A;font:14px/1.45 monospace;white-space:pre-wrap;' +
      'border-radius:8px;pointer-events:none',
  )
  document.body.appendChild(box)

  const sup = (prop: string, value: string) => (window.CSS?.supports?.(prop, value) ? 'sim' : 'NÃO')
  const chrome = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? '?'
  const base = [
    `Motor Chrome: ${chrome}`,
    `User agent: ${navigator.userAgent}`,
    `Tela lógica: ${window.innerWidth} x ${window.innerHeight} (dpr ${window.devicePixelRatio})`,
    `Tela física: ${Math.round(screen.width * window.devicePixelRatio)} x ${Math.round(screen.height * window.devicePixelRatio)}`,
    `Modo totem: ${document.documentElement.hasAttribute('data-totem') ? 'LIGADO' : 'desligado (abra com ?totem=1)'}`,
    `CPU: ${navigator.hardwareConcurrency ?? '?'} núcleos · RAM: ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'} GB`,
    `CSS aspect-ratio: ${sup('aspect-ratio', '1')} · inset: ${sup('inset', '0')} · :has: ${window.CSS?.supports?.('selector(:has(a))') ? 'sim' : 'NÃO'} · content-visibility: ${sup('content-visibility', 'auto')}`,
  ]

  // Quadros por segundo, medidos continuamente em janelas de 2 s.
  let frames = 0
  let start = performance.now()
  let fps = '…'
  const tick = (now: number) => {
    frames++
    if (now - start >= 2000) {
      fps = String(Math.round((frames * 1000) / (now - start)))
      frames = 0
      start = now
      box.textContent = [...base, `Quadros por segundo: ${fps}`].join('\n')
    }
    requestAnimationFrame(tick)
  }
  box.textContent = [...base, `Quadros por segundo: ${fps}`].join('\n')
  requestAnimationFrame(tick)
}
