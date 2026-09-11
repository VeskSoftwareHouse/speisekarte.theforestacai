import type { Imposto } from '@shared/types'

/**
 * Aplica os impostos ativos vinculados a um insumo sobre o valor unitário
 * de compra — percentuais primeiro (sobre o valor original), depois fixos
 * por unidade. Calculado sempre na hora, a partir do cadastro atual: nunca
 * gravado dentro do pedido, mesmo espírito de `insumo_saldos` (a fonte da
 * verdade é o cadastro, não um valor congelado no passado).
 */
export function valorUnitarioComImposto(valorUnitario: number, insumoId: string, impostos: Imposto[]): number {
  const doInsumo = impostos.filter((i) => i.ativo && i.insumo_id === insumoId)
  const percentual = doInsumo.filter((i) => i.tipo === 'percentual').reduce((soma, i) => soma + i.valor, 0)
  const fixo = doInsumo.filter((i) => i.tipo === 'fixo').reduce((soma, i) => soma + i.valor, 0)
  return valorUnitario * (1 + percentual / 100) + fixo
}
