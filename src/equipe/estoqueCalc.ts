import type { Imposto } from '@shared/types'

/**
 * O imposto PERCENTUAL cadastrado já está embutido no valor unitário que a
 * pessoa digita na compra (mesmo espírito de um preço de nota fiscal com
 * imposto incluso) — o sistema só separa quanto disso é imposto pra mostrar
 * na tela, nunca soma de novo por cima. Só o imposto FIXO (uma taxa que não
 * vem na nota, cobrada à parte — ex: taxa de importação) continua sendo
 * somado, porque esse não tem como já estar embutido num valor que a pessoa
 * nunca chegou a ver. Calculado sempre na hora, a partir do cadastro atual:
 * nunca gravado dentro do pedido, mesmo espírito de `insumo_saldos` (a fonte
 * da verdade é o cadastro, não um valor congelado no passado).
 */
export function valorUnitarioComImposto(valorUnitario: number, insumoId: string, impostos: Imposto[]): number {
  const fixo = impostos
    .filter((i) => i.ativo && i.insumo_id === insumoId && i.tipo === 'fixo')
    .reduce((soma, i) => soma + i.valor, 0)
  return valorUnitario + fixo
}

/**
 * Quanto do valor unitário é imposto — direto: X% de imposto sobre um valor
 * de CHF 100 é CHF (X/100 × 100), não uma extração "por dentro" tipo IVA.
 * Mais o imposto fixo (que é 100% imposto, por definição). Só pra
 * exibição/relatório: nunca entra duas vezes no custo, que já é
 * `valorUnitarioComImposto`.
 */
export function impostoEmbutidoUnitario(valorUnitario: number, insumoId: string, impostos: Imposto[]): number {
  const doInsumo = impostos.filter((i) => i.ativo && i.insumo_id === insumoId)
  const percentual = doInsumo.filter((i) => i.tipo === 'percentual').reduce((soma, i) => soma + i.valor, 0)
  const fixo = doInsumo.filter((i) => i.tipo === 'fixo').reduce((soma, i) => soma + i.valor, 0)
  return valorUnitario * (percentual / 100) + fixo
}
