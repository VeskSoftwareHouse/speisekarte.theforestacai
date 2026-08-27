import type { TipTipo } from './types'

/**
 * Formata como o cardápio impresso da loja: "CHF 14,90" (vírgula decimal).
 * O separador de milhar não aparece em preço de produto — nenhum passa de
 * CHF 60 — mas os totais dos relatórios passam, e "CHF 11.652,20" se lê de
 * relance enquanto "CHF 11652,20" obriga a contar as casas.
 */
const CHF_FORMAT = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCHF(value: number): string {
  return `CHF ${CHF_FORMAT.format(value)}`
}

/**
 * O rótulo de um botão de gorjeta: "5%" ou "CHF 5,00".
 *
 * Uma opção percentual se anuncia como porcentagem, e não pelo que ela dá
 * neste carrinho — "CHF 0,05" num pedido de um franco não diz ao cliente o
 * que ele está escolhendo, e muda de número a cada item que ele acrescenta.
 * Quanto virou em francos aparece na linha da gorjeta, no total.
 */
export function formatTipLabel(option: { tipo: TipTipo; valor: number }): string {
  if (option.tipo === 'percentual') return `${String(option.valor).replace('.', ',')}%`
  return formatCHF(option.valor)
}

/** "há 3 min" / "há 1h 12min" a partir de um timestamp ISO */
export function elapsedLabel(isoDate: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(isoDate).getTime()
  const totalMin = Math.max(0, Math.floor(diffMs / 60000))
  if (totalMin < 1) return 'agora'
  if (totalMin < 60) return `há ${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `há ${h}h ${m}min`
}
