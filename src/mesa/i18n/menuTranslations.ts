import type { LanguageCode } from './languages'

/**
 * Texto (nome ou descrição) de um item/categoria no idioma escolhido. As
 * traduções vêm de `menu_items.nome_i18n`/`descricao_i18n` e
 * `categories.nome_i18n` (editadas pela equipe no painel de gestão de
 * cardápio); alemão (a coluna original) é sempre o fallback quando uma
 * tradução não foi cadastrada para o idioma.
 */
export function translatedField(
  i18n: Record<string, string> | null | undefined,
  lang: LanguageCode,
  fallback: string | null,
): string | null {
  if (lang === 'de') return fallback
  const translated = i18n?.[lang]
  return translated && translated.trim() ? translated : fallback
}
