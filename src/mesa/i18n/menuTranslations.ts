import type { LanguageCode } from './languages'

/**
 * Descrição do item no idioma escolhido. As traduções vêm de
 * `menu_items.descricao_i18n` (editadas pela equipe no painel de gestão de
 * cardápio); alemão (a coluna `descricao`) é sempre o fallback quando uma
 * tradução não foi cadastrada para o idioma.
 */
export function translatedDescription(
  descricaoI18n: Record<string, string> | null | undefined,
  lang: LanguageCode,
  fallback: string | null,
): string | null {
  if (lang === 'de') return fallback
  const translated = descricaoI18n?.[lang]
  return translated && translated.trim() ? translated : fallback
}
