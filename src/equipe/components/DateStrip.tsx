import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { daysInMonth, monthKeyToDate, toDateKey, toMonthKey, weekdayLabel } from '../dateUtils'

interface Props {
  selectedDateKey: string
  onSelect: (key: string) => void
  /** Mês aberto na faixa, ex: "2026-08". Vive no App porque é ele que busca as contagens desse mês. */
  monthKey: string
  onMonthChange: (key: string) => void
  orderCountByDate: Record<string, number>
}

export default function DateStrip({ selectedDateKey, onSelect, monthKey, onMonthChange, orderCountByDate }: Props) {
  const today = new Date()
  const todayKey = toDateKey(today)

  const viewedDate = monthKeyToDate(monthKey)
  const days = daysInMonth(viewedDate.getFullYear(), viewedDate.getMonth())
  const rawMonthLabel = viewedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthLabel = rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1)

  function goToMonth(delta: number) {
    onMonthChange(toMonthKey(new Date(viewedDate.getFullYear(), viewedDate.getMonth() + delta, 1)))
  }

  const selectedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [monthKey])

  return (
    <div className="date-strip">
      <p className="date-strip__month">{monthLabel}</p>
      <div className="date-strip__row">
        <button className="date-strip__nav" onClick={() => goToMonth(-1)} aria-label="Mês anterior">
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <div className="date-strip__days">
          {days.map((d) => {
            const key = toDateKey(d)
            const count = orderCountByDate[key] ?? 0
            const isSelected = key === selectedDateKey
            const isToday = key === todayKey
            return (
              <button
                key={key}
                ref={isSelected ? selectedRef : undefined}
                className={`date-strip__day ${isSelected ? 'date-strip__day--selected' : ''} ${
                  isToday && !isSelected ? 'date-strip__day--today' : ''
                }`}
                onClick={() => onSelect(key)}
              >
                <span className="date-strip__weekday">{weekdayLabel(d)}</span>
                <span className="date-strip__number">{d.getDate()}</span>
                <span className="date-strip__dot-slot">
                  {count > 0 && <span className="date-strip__badge" title={`${count} pedido(s)`} />}
                </span>
              </button>
            )
          })}
        </div>
        <button className="date-strip__nav" onClick={() => goToMonth(1)} aria-label="Próximo mês">
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
