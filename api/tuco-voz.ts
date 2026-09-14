import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'
import { requireCaller } from './_auth.js'

const geminiApiKey = process.env.GEMINI_API_KEY

const MODEL = 'gemini-3.1-flash-tts-preview'
// "Puck" é a voz descrita pelo Google como animada (upbeat) — combina com um
// tucano mascote brincalhão.
const VOZ = 'Puck'

// Cada caractere falado custa — respostas do Tuco são curtas, então isto só
// corta abuso ou uma resposta fora do normal.
const MAX_CARACTERES = 1500

/**
 * Voz do Tuco: transforma a resposta dele em áudio natural pelo TTS do
 * Gemini, repassando o áudio em streaming. Gerar a fala inteira leva mais
 * tempo que a própria fala (~15 s pra 12 s de áudio), mas o primeiro pedaço
 * chega em menos de 1 s — o painel já começa a tocar e vai emendando o resto.
 *
 * Resposta: PCM cru 16-bit little-endian, mono, na taxa do cabeçalho
 * `X-Sample-Rate`. Se falhar antes de mandar áudio, responde com erro JSON e o
 * painel cai na voz do navegador.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!geminiApiKey) {
    res.status(500).json({ error: 'Servidor não configurado (GEMINI_API_KEY ausente).' })
    return
  }
  // Mesma proteção do translate.ts: sem login ninguém gasta a cota do Gemini.
  if (!(await requireCaller(req))) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const texto = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, MAX_CARACTERES) : ''
  if (!texto) {
    res.status(400).json({ error: 'Nada para falar.' })
    return
  }

  // Se o painel cancelar (fechou o chat, abriu o microfone), para de gerar —
  // senão o Gemini continuaria cobrando uma fala que ninguém vai ouvir.
  let cancelado = false
  req.on('close', () => {
    cancelado = true
  })

  let comecou = false
  try {
    const client = new GoogleGenAI({ apiKey: geminiApiKey })
    const stream = await client.interactions.create({
      model: MODEL,
      input: `Fale em português do Brasil, como o Tuco, um tucano mascote simpático e bem-humorado: tom animado e caloroso, ritmo natural e leve, sem exagero. Leia exatamente o texto abaixo:\n\n${texto}`,
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [{ voice: VOZ, language: 'pt-BR' }],
      },
      stream: true,
    })

    for await (const evento of stream) {
      if (cancelado) break
      if (evento.event_type !== 'step.delta' || evento.delta.type !== 'audio' || !evento.delta.data) continue
      if (!comecou) {
        comecou = true
        res.status(200)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('X-Sample-Rate', String(evento.delta.sample_rate ?? 24000))
        res.setHeader('Cache-Control', 'no-store')
      }
      res.write(Buffer.from(evento.delta.data, 'base64'))
    }

    if (!comecou) {
      res.status(502).json({ error: 'Resposta de voz vazia.' })
      return
    }
    res.end()
  } catch (err) {
    // Já mandou áudio: não dá mais pra trocar o status — só encerra, e o
    // painel toca o que chegou.
    if (comecou) {
      res.end()
      return
    }
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao gerar a voz.' })
  }
}
