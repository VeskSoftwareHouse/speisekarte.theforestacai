import type { Insumo } from './types'

/**
 * Composição de produto (menu_item_insumos.quantidade) é sempre gravada na
 * mesma unidade de controle do insumo (ver comentário na tabela, em
 * supabase/schema.sql) — é o que a baixa de estoque subtrai direto do saldo.
 * Um insumo controlado em litros/mililitros (ex: um saco de açaí comprado
 * por litro) pode ter uma densidade cadastrada (`gramas_por_litro`, ver
 * InsumoFormModal) só pra deixar a EXIBIÇÃO e a DIGITAÇÃO da composição em
 * gramas — mais prático pra quem está montando a receita com uma balança.
 * Por baixo, o valor salvo continua na unidade de controle: nada muda na
 * baixa de estoque, nos relatórios ou no saldo.
 */

/** Insumo com a densidade cadastrada — o que permite digitar a composição em gramas. */
export function aceitaGramasNaComposicao(insumo: Insumo | undefined): insumo is Insumo & { gramas_por_litro: number } {
  return !!insumo && (insumo.unidade === 'l' || insumo.unidade === 'ml') && !!insumo.gramas_por_litro
}

/** Converte uma quantidade na unidade de controle do insumo (l ou ml) para gramas. */
export function paraGramas(quantidade: number, insumo: Insumo & { gramas_por_litro: number }): number {
  const litros = insumo.unidade === 'ml' ? quantidade / 1000 : quantidade
  return litros * insumo.gramas_por_litro
}

/** Converte gramas de volta pra unidade de controle do insumo — o inverso de paraGramas. */
export function deGramas(gramas: number, insumo: Insumo & { gramas_por_litro: number }): number {
  const litros = gramas / insumo.gramas_por_litro
  return insumo.unidade === 'ml' ? litros * 1000 : litros
}
