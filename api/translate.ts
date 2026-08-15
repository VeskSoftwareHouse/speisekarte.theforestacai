import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'

const geminiApiKey = process.env.GEMINI_API_KEY

/** Idiomas do cardápio, fora o alemão — que é a fonte, não um destino. */
const TARGET_LANGS = ['fr', 'it', 'en', 'pt', 'es'] as const
const LANG_NAMES: Record<string, string> = {
  fr: 'French',
  it: 'Italian',
  en: 'English',
  pt: 'Brazilian Portuguese',
  es: 'Spanish',
}

/** Campos que o painel manda traduzir. `descricao` só aparece em produtos. */
const TRANSLATABLE_FIELDS = ['nome', 'descricao'] as const
type Field = (typeof TRANSLATABLE_FIELDS)[number]

const SYSTEM_INSTRUCTION = `You translate menu content for Forest Açaí, a Brazilian açaí shop in Switzerland. The source language is German.

Translate for a printed menu, not prose: keep the same register, length, and punctuation style as the German. A two-word item name stays a two-word item name.

Leave untranslated anything that is a name rather than a word: the shop's own product names, Brazilian ingredients that are known by their Brazilian name (Açaí, Cupuaçu, Graviola, Maracujá, Caju, Cajá, Acerola, Paçoca, Tapioka), and commercial brands (Nutella, Oreo, Biscoff, Ovomaltine, M&M, Smarties). Translate ordinary food words normally.

Keep units and numbers exactly as written (300 ml stays 300 ml). Preserve capitalization conventions of the target language.`

/**
 * Monta o schema de saída a partir dos campos recebidos, para o modelo devolver
 * exatamente um objeto por idioma com exatamente os campos pedidos.
 */
function buildSchema(fields: Field[]) {
  const perLanguage = {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
    required: fields,
  }
  return {
    type: 'object',
    properties: Object.fromEntries(TARGET_LANGS.map((l) => [l, perLanguage])),
    required: [...TARGET_LANGS],
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!geminiApiKey) {
    res.status(500).json({ error: 'Servidor não configurado (GEMINI_API_KEY ausente).' })
    return
  }

  const texts = req.body?.texts
  if (!texts || typeof texts !== 'object') {
    res.status(400).json({ error: 'Nada para traduzir.' })
    return
  }

  // Só traduz o que veio preenchido: um produto sem descrição não deve gerar
  // uma descrição inventada nos outros idiomas.
  const fields = TRANSLATABLE_FIELDS.filter(
    (f) => typeof texts[f] === 'string' && texts[f].trim(),
  )
  if (fields.length === 0) {
    res.status(400).json({ error: 'Nada para traduzir.' })
    return
  }

  const source = Object.fromEntries(fields.map((f) => [f, (texts[f] as string).trim()]))
  const client = new GoogleGenAI({ apiKey: geminiApiKey })

  try {
    const interaction = await client.interactions.create({
      model: 'gemini-3.6-flash',
      system_instruction: SYSTEM_INSTRUCTION,
      input: `Translate into ${TARGET_LANGS.map((l) => LANG_NAMES[l]).join(', ')}:\n\n${JSON.stringify(source, null, 2)}`,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: buildSchema(fields),
      },
    })

    const output = interaction.output_text
    if (!output) {
      res.status(502).json({ error: 'Resposta de tradução vazia.' })
      return
    }

    res.status(200).json({ translations: JSON.parse(output) })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao traduzir.' })
  }
}
