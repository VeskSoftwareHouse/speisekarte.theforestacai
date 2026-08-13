import { useState } from 'react'

function digitsToValue(digits: string): number {
  return Number(digits || '0') / 100
}

function digitsToDisplay(digits: string): string {
  const padded = digits.padStart(3, '0')
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, '')
  const decimals = padded.slice(-2)
  return `${whole},${decimals}`
}

interface Props {
  value: number
  onChange: (value: number) => void
  required?: boolean
  id?: string
}

export default function CurrencyInput({ value, onChange, required, id }: Props) {
  const [digits, setDigits] = useState(() => Math.round(value * 100).toString())

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextDigits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0'
    setDigits(nextDigits)
    onChange(digitsToValue(nextDigits))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={digitsToDisplay(digits)}
      onChange={handleChange}
      placeholder="0,00"
      required={required}
    />
  )
}
