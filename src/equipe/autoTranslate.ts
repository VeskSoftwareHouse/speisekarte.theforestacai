/**
 * Tradução automática do cardápio.
 *
 * A equipe cadastra tudo em alemão e as traduções para os outros cinco idiomas
 * são geradas ao salvar, indo para as mesmas colunas `*_i18n` que o App da Mesa
 * já lê. Nada muda do lado do cliente — ele continua caindo no alemão quando
 * falta tradução.
 */

import { authFetch } from '@shared/authFetch'

interface SourceTexts {
  nome: string
  descricao?: string
}

interface ExistingRecord {
  nome: string
  descricao?: string | null
  nome_i18n: Record<string, string>
  descricao_i18n?: Record<string, string>
}

export interface Translations {
  nome_i18n: Record<string, string>
  descricao_i18n: Record<string, string>
}

/** A API devolve um objeto por idioma; aqui viramos para um objeto por campo. */
function pivotByField(byLanguage: Record<string, Record<string, string>>): Translations {
  const nome_i18n: Record<string, string> = {}
  const descricao_i18n: Record<string, string> = {}
  for (const [lang, fields] of Object.entries(byLanguage)) {
    if (fields?.nome?.trim()) nome_i18n[lang] = fields.nome.trim()
    if (fields?.descricao?.trim()) descricao_i18n[lang] = fields.descricao.trim()
  }
  return { nome_i18n, descricao_i18n }
}

/**
 * Traduções a gravar junto com o registro.
 *
 * Só chama a API quando o texto em alemão mudou (ou quando ainda não há
 * tradução) — salvar de novo sem mexer no texto não regera nada.
 *
 * Nunca lança: se a tradução falhar, o item é salvo mesmo assim com o que já
 * existia, e a Mesa mostra o alemão. Bloquear o salvamento por causa de uma
 * falha de rede deixaria a equipe sem conseguir mexer no cardápio.
 */
export async function translationsFor(
  next: SourceTexts,
  existing: ExistingRecord | null | undefined,
  accessToken: string,
): Promise<Translations> {
  const current: Translations = {
    nome_i18n: existing?.nome_i18n ?? {},
    descricao_i18n: existing?.descricao_i18n ?? {},
  }

  const nome = next.nome.trim()
  const descricao = next.descricao?.trim() ?? ''
  const sourceChanged =
    !existing || existing.nome.trim() !== nome || (existing.descricao?.trim() ?? '') !== descricao
  const hasTranslations = Object.keys(current.nome_i18n).length > 0
  if (!sourceChanged && hasTranslations) return current

  try {
    const res = await authFetch(
      '/api/translate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: { nome, ...(descricao ? { descricao } : {}) } }),
      },
      accessToken,
    )
    const data = await res.json()
    if (!res.ok || !data?.translations) throw new Error(data?.error ?? 'Falha na tradução.')
    return pivotByField(data.translations)
  } catch (err) {
    console.error('Tradução automática falhou; salvando só com o alemão.', err)
    return current
  }
}
