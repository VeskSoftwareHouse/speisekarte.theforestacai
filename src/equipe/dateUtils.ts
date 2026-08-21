const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isoToDateKey(iso: string): string {
  return toDateKey(new Date(iso))
}

export function weekdayLabel(d: Date): string {
  return WEEKDAY_LABELS[d.getDay()]
}

/** Todos os dias do mês (0-indexado) de `year`, como objetos Date locais. */
export function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

/** Meia-noite do dia de `d`, no fuso local. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Último instante do dia de `d` (23:59:59.999), no fuso local. */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

/** "2026-08" — chave estável de mês, usada para agrupar a tendência mensal. */
export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Converte "2026-08-20" de volta em Date local (meia-noite). */
export function dateKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "20/08/2026" */
export function formatDateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** "ago/26" — rótulo curto do gráfico de tendência. */
export function shortMonthLabel(d: Date): string {
  // Montado à mão porque o formato pronto do navegador sai como "ago. de 26",
  // longo demais para caber embaixo de doze pontos do gráfico.
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${month}/${String(d.getFullYear()).slice(-2)}`
}
