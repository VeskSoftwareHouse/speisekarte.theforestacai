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

/** O Gemini devolve PCM cru (16-bit, mono); o <audio> do navegador precisa de
 * um contêiner — o WAV é só um cabeçalho de 44 bytes na frente. */
function pcmParaWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * channels * 2
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(channels * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * Voz do Tuco: transforma a resposta dele em áudio natural pelo TTS do
 * Gemini. Se falhar, o painel cai na voz do próprio navegador.
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

  try {
    const client = new GoogleGenAI({ apiKey: geminiApiKey })
    const interaction = await client.interactions.create({
      model: MODEL,
      input: `Fale em português do Brasil, como o Tuco, um tucano mascote simpático e bem-humorado: tom animado e caloroso, ritmo natural e leve, sem exagero. Leia exatamente o texto abaixo:\n\n${texto}`,
      response_format: { type: 'audio' },
      generation_config: {
        speech_config: [{ voice: VOZ, language: 'pt-BR' }],
      },
    })

    const audio = interaction.output_audio
    if (!audio?.data) {
      res.status(502).json({ error: 'Resposta de voz vazia.' })
      return
    }

    const wav = pcmParaWav(Buffer.from(audio.data, 'base64'), audio.sample_rate ?? 24000, audio.channels ?? 1)
    res.setHeader('Content-Type', 'audio/wav')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(wav)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao gerar a voz.' })
  }
}
