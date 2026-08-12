import { Globe } from 'lucide-react'
import { LANGUAGES, type LanguageCode } from '../i18n/languages'
import { useLanguage } from '../i18n/LanguageContext'

interface Props {
  variant?: 'dark' | 'light'
}

export default function LanguageSelector({ variant = 'dark' }: Props) {
  const { lang, setLang, t } = useLanguage()

  return (
    <label className={`language-selector language-selector--${variant}`}>
      <Globe size={16} strokeWidth={2} aria-hidden />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as LanguageCode)}
        aria-label={t('languageLabel')}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.code.toUpperCase()} — {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
