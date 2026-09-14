/**
 * Cor aproximada da fruta pelo nome — só pra dar uma pista visual rápida na
 * comanda da cozinha (ex: "Banane" em amarelo), não uma identificação exata.
 * Casa por trecho do nome, sem se importar com maiúsculas/idioma — os
 * adicionais do cardápio têm nome em alemão, mas às vezes é digitado em
 * português. Fruta fora desta lista, ou qualquer outro adicional (Oreo,
 * Nutella, Granola...), fica com a cor padrão do texto.
 */
const FRUIT_COLORS: [RegExp, string][] = [
  [/banan/i, '#b8860b'],
  [/morang|erdbeer|strawberr|fraise|fragol/i, '#d1373f'],
  [/mirtil|blaubeer|blueberr|myrtill/i, '#4353b3'],
  [/mang/i, '#e07a1f'],
  [/kiwi/i, '#6a9a23'],
  [/abacaxi|ananas|pineappl/i, '#d4a017'],
  [/\buva|traube|\bgrape|raisin/i, '#7b4397'],
  [/laranja|\borange\b|arancia/i, '#e0701f'],
  [/lim(ã|a)o|zitrone|\blemon|citron|limone/i, '#a3b91f'],
  [/melanci|wassermelone|watermelon|pastèque/i, '#d43f57'],
  [/cerej|kirsche|\bcherry|cerise|ciliegia/i, '#b3182a'],
  [/framboes|himbeer|raspberr|framboise|lampone/i, '#c23a6b'],
  [/maracuj|passionfruit|fruit de la passion/i, '#e8a33d'],
]

export function fruitColor(nome: string): string | undefined {
  for (const [padrao, cor] of FRUIT_COLORS) {
    if (padrao.test(nome)) return cor
  }
  return undefined
}
