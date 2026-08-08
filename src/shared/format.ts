/** Formata como o cardápio impresso da loja: "CHF 14,90" (vírgula decimal). */
export function formatCHF(value: number): string {
  return `CHF ${value.toFixed(2).replace('.', ',')}`
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
