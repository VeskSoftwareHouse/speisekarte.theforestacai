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
