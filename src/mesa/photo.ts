import type { SyntheticEvent } from 'react'

/**
 * Fotos do cardápio no tamanho em que aparecem, não no original.
 *
 * As fotos sobem para o Storage com ~1100x1450 px e 100–350 KB, mas o card
 * mostra ~240 px. Num totem fraco isso pesa duas vezes: baixa à toa e,
 * principalmente, cada foto decodificada ocupa ~6 MB de memória de vídeo, o que
 * travava a rolagem. O endpoint de transformação do Supabase devolve a mesma
 * foto já reduzida (e em WebP, quando o navegador aceita).
 *
 * Um único tamanho por produto (card, modal, carrinho e voo usam o mesmo
 * endereço): o navegador baixa uma vez e o modal já abre com a foto em cache.
 */

const OBJECT = '/storage/v1/object/public/'
const RENDER = '/storage/v1/render/image/public/'

const PRODUCT_WIDTH = 480
const OPTION_WIDTH = 160

function resized(url: string, width: number): string {
  if (!url.includes(OBJECT)) return url
  const base = url.replace(OBJECT, RENDER)
  // resize=contain mantém a proporção; sem ele o Supabase recorta a altura.
  return `${base}${base.includes('?') ? '&' : '?'}width=${width}&resize=contain&quality=72`
}

/** Se a transformação falhar (plano, limite, fora do ar), cai para o original. */
function fallbackTo(original: string) {
  return (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.src !== original) img.src = original
  }
}

function photoProps(url: string, width: number) {
  return { src: resized(url, width), onError: fallbackTo(url), decoding: 'async' as const }
}

/** Foto de produto: card, modal, carrinho, resumo. */
export const productPhoto = (url: string) => photoProps(url, PRODUCT_WIDTH)
/** Foto pequena de opção/ingrediente (pílulas de 48 px). */
export const optionPhoto = (url: string) => photoProps(url, OPTION_WIDTH)
/** Só o endereço, para quem não monta um <img> direto (voo até o carrinho). */
export const productPhotoUrl = (url: string | null) => (url ? resized(url, PRODUCT_WIDTH) : null)
