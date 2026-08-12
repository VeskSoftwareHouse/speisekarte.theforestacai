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
