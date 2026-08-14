import { Search } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

export default function AdminSearchInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="admin-panel__search">
      <Search size={16} strokeWidth={2} aria-hidden />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
