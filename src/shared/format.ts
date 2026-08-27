import { tipAmountFor, type TipTipo } from './types'

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
 * O rótulo de um botão de gorjeta.
 *
 * Uma opção fixa é o próprio valor: "CHF 10,00". Uma percentual mostra as
 * duas coisas — "5% · CHF 0,05" — porque nenhuma das duas basta sozinha: a
 * porcentagem diz o que se está escolhendo, e os francos dizem quanto isso
 * custa neste carrinho.
 *
 * Sem `subtotal` sai só a porcentagem, que é o caso do painel da equipe: lá
 * não existe carrinho, e a conversão aparece na descrição da linha.
 */
export function formatTipLabel(option: { tipo: TipTipo; valor: number }, subtotal?: number): string {
  if (option.tipo !== 'percentual') return formatCHF(option.valor)
  const porcentagem = `${String(option.valor).replace('.', ',')}%`
  if (subtotal === undefined) return porcentagem
  return `${porcentagem} · ${formatCHF(tipAmountFor(option, subtotal))}`
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
