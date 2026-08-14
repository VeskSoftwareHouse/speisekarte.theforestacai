import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Globe } from 'lucide-react'
import { LANGUAGES } from '../i18n/languages'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  variant?: 'dark' | 'light'
}

export default function LanguageSelector({ variant = 'dark' }: Props) {
  const { lang, setLang, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLUListElement | null>(null)
  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0]

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const estimatedMenuHeight = LANGUAGES.length * 44 + 12
      const right = window.innerWidth - rect.right
      const fitsBelow = rect.bottom + 8 + estimatedMenuHeight <= window.innerHeight
      setMenuPos(
        fitsBelow
          ? { top: rect.bottom + 8, right }
          : { bottom: window.innerHeight - rect.top + 8, right },
      )
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handleScrollOrResize() {
      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  return (
    <div className={`language-selector language-selector--${variant}`}>
      <button
        ref={triggerRef}
        type="button"
        className="language-selector__trigger"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('languageLabel')}
      >
        <Globe size={16} strokeWidth={2} aria-hidden />
        <span>
          {active.code.toUpperCase()} — {active.label}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="language-selector__chevron"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
          aria-hidden
        />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <ul
            ref={menuRef}
            className="language-selector__menu"
            role="listbox"
            style={{ top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right }}
          >
            {LANGUAGES.map((l) => (
              <li key={l.code} role="option" aria-selected={l.code === lang}>
                <button
                  type="button"
                  className={`language-selector__option ${
                    l.code === lang ? 'language-selector__option--active' : ''
                  }`}
                  onClick={() => {
                    setLang(l.code)
                    setOpen(false)
                  }}
                >
                  <span className="language-selector__option-code">{l.code.toUpperCase()}</span>
                  {l.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
