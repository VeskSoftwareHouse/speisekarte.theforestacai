import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const anthropicApiKey = process.env.ANTHROPIC_API_KEY

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

const SYSTEM_PROMPT = `You translate menu content for Forest Açaí, a Brazilian açaí shop in Switzerland. The source language is German.

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
    additionalProperties: false,
  }
  return {
    type: 'object',
    properties: Object.fromEntries(TARGET_LANGS.map((l) => [l, perLanguage])),
    required: [...TARGET_LANGS],
    additionalProperties: false,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!anthropicApiKey) {
    res.status(500).json({ error: 'Servidor não configurado (ANTHROPIC_API_KEY ausente).' })
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
  const client = new Anthropic({ apiKey: anthropicApiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // Tradução de item de cardápio é tarefa curta e direta: esforço baixo
      // entrega o mesmo resultado gastando menos tempo e tokens.
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: buildSchema(fields),
        },
      },
      messages: [
        {
          role: 'user',
          content: `Translate into ${TARGET_LANGS.map((l) => LANG_NAMES[l]).join(', ')}:\n\n${JSON.stringify(source, null, 2)}`,
        },
      ],
    })

    if (message.stop_reason === 'refusal') {
      res.status(422).json({ error: 'Não foi possível traduzir este conteúdo.' })
      return
    }

    const text = message.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      res.status(502).json({ error: 'Resposta de tradução vazia.' })
      return
    }

    res.status(200).json({ translations: JSON.parse(text.text) })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao traduzir.' })
  }
}
