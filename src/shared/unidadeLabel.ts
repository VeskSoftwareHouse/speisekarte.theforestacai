import type { Unidade } from './types'

/** Nome por extenso de cada unidade de controle de estoque — usado em toda
 * tela que mostra a unidade de um insumo, pra nunca abreviar ("kg", "un.")
 * onde a equipe está lendo rápido no meio do expediente. */
export const UNIDADE_LABEL: Record<Unidade, string> = {
  kg: 'quilogramas',
  g: 'gramas',
  l: 'litros',
  ml: 'mililitros',
  unidade: 'unidades',
}
