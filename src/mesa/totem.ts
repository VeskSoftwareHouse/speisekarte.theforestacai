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

const KEY = 'mesa:totem'
export const TOTEM_WIDTH = 1080

function readFlag(): boolean {
  const param = new URLSearchParams(window.location.search).get('totem')
  try {
    if (param === '1') localStorage.setItem(KEY, '1')
    else if (param === '0') localStorage.removeItem(KEY)
    return localStorage.getItem(KEY) === '1'
  } catch {
    // Sem storage (modo privado, quiosque bloqueado): vale só o parâmetro.
    return param === '1'
  }
}

export function applyTotemMode() {
  if (!readFlag()) return
  document.documentElement.dataset.totem = ''
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (meta) {
    meta.content = `width=${TOTEM_WIDTH}, user-scalable=no, viewport-fit=cover`
  }
}
