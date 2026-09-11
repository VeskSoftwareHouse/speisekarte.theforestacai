import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  GoogleGenAI,
  createUserContent,
  createModelContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  type Content,
} from '@google/genai'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireCaller } from './_auth.js'

const geminiApiKey = process.env.GEMINI_API_KEY
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Mesmo modelo já validado em produção por api/translate.ts — reaproveitado
// aqui, só que pela superfície `models.generateContent` (não
// `interactions.create`), que é a documentada pelo SDK para function
// calling.
const MODEL = 'gemini-3.6-flash'

// Nunca deixa a conversa girar em loop de ferramentas cobrando a API à toa
// se o modelo insistir em chamar function calls sem nunca concluir.
const MAX_TOOL_ROUNDS = 5

const SYSTEM_INSTRUCTION = `Você é a assistente do Painel da Equipe da The Forest Açaí, um food truck de açaí na Suíça. Responda sempre em português, de forma direta e curta — quem está te lendo é a equipe no meio do expediente, não tem tempo pra textão.

Você só sabe o que as ferramentas disponíveis te contam. Nunca invente números de vendas, faturamento ou estoque — se a pergunta precisar de dado real, chame a ferramenta certa antes de responder. Se a pergunta não tiver nada a ver com vendas ou estoque desta loja, diga que só sabe responder sobre isso. Você ainda não sabe cadastrar nem editar nada — só consultar.`

/** Mesmos valores de PAID_STATUSES (@shared/types) — escritos direto aqui porque
 * `api/*.ts` não importa de `src/` de forma confiável (ver plano/estoque). */
const PAID_STATUSES = ['recebido', 'em_preparo', 'pronto', 'entregue']

function periodoParaIntervalo(periodo: string): { inicio: Date; fim: Date } {
  const agora = new Date()
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const fimAberto = new Date(agora.getTime() + 1000)

  if (periodo === 'ontem') {
    const inicio = new Date(inicioHoje)
    inicio.setDate(inicio.getDate() - 1)
    return { inicio, fim: inicioHoje }
  }
  if (periodo === 'semana') {
    const inicio = new Date(inicioHoje)
    inicio.setDate(inicio.getDate() - 7)
    return { inicio, fim: fimAberto }
  }
  if (periodo === 'mes') {
    return { inicio: new Date(agora.getFullYear(), agora.getMonth(), 1), fim: fimAberto }
  }
  return { inicio: inicioHoje, fim: fimAberto }
}

interface OrderItemRow {
  nome_item: string
  quantidade: number
}
interface OrderRow {
  valor_pago: number | null
  gorjeta: number | null
  order_items: OrderItemRow[] | null
}

async function consultarVendas(supabase: SupabaseClient, args: { periodo?: string }) {
  const periodo = args.periodo ?? 'hoje'
  const { inicio, fim } = periodoParaIntervalo(periodo)
  const { data, error } = await supabase
    .from('orders')
    .select('valor_pago, gorjeta, order_items(nome_item, quantidade)')
    .in('status', PAID_STATUSES)
    .gte('criado_em', inicio.toISOString())
    .lte('criado_em', fim.toISOString())
  if (error) return { error: error.message }

  const pedidos = (data ?? []) as unknown as OrderRow[]
  const faturamento = pedidos.reduce((soma, p) => soma + (p.valor_pago ?? 0), 0)
  const gorjetas = pedidos.reduce((soma, p) => soma + (p.gorjeta ?? 0), 0)

  const porProduto = new Map<string, number>()
  for (const pedido of pedidos) {
    for (const item of pedido.order_items ?? []) {
      porProduto.set(item.nome_item, (porProduto.get(item.nome_item) ?? 0) + item.quantidade)
    }
  }

  return {
    periodo,
    pedidos: pedidos.length,
    faturamento_chf: Number(faturamento.toFixed(2)),
    gorjetas_chf: Number(gorjetas.toFixed(2)),
    produtos_vendidos: [...porProduto.entries()]
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
  }
}

interface InsumoRow {
  id: string
  nome: string
  unidade: string
  estoque_minimo: number | null
}

async function consultarEstoque(supabase: SupabaseClient, args: { insumo?: string }) {
  const [insumosRes, saldosRes] = await Promise.all([
    supabase.from('insumos').select('id, nome, unidade, estoque_minimo').eq('ativo', true),
    supabase.from('insumo_saldos').select('insumo_id, saldo_atual'),
  ])
  if (insumosRes.error) return { error: insumosRes.error.message }
  if (saldosRes.error) return { error: saldosRes.error.message }

  const saldoPorId = new Map<string, number>(
    (saldosRes.data ?? []).map((s: { insumo_id: string; saldo_atual: number }) => [s.insumo_id, s.saldo_atual]),
  )
  let insumos = (insumosRes.data ?? []) as InsumoRow[]
  if (args.insumo) {
    const termo = args.insumo.toLowerCase()
    insumos = insumos.filter((i) => i.nome.toLowerCase().includes(termo))
  }

  return {
    insumos: insumos.map((i) => {
      const saldo = saldoPorId.get(i.id) ?? 0
      return {
        nome: i.nome,
        saldo,
        unidade: i.unidade,
        saldo_baixo: i.estoque_minimo != null && saldo < i.estoque_minimo,
      }
    }),
  }
}

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'consultar_vendas',
        description: 'Consulta pedidos pagos, faturamento e quantidade vendida por produto num período.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            periodo: {
              type: 'string',
              enum: ['hoje', 'ontem', 'semana', 'mes'],
              description: 'Período a consultar. Padrão: hoje.',
            },
          },
        },
      },
      {
        name: 'consultar_estoque',
        description: 'Consulta o saldo atual de estoque dos insumos cadastrados.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            insumo: {
              type: 'string',
              description: 'Nome (ou parte do nome) de um insumo específico. Deixe vazio para listar todos.',
            },
          },
        },
      },
    ],
  },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado.' })
    return
  }
  if (!(await requireCaller(req))) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const history = Array.isArray(req.body?.contents) ? (req.body.contents as Content[]) : []
  if (!message) {
    res.status(400).json({ error: 'Mensagem vazia.' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const client = new GoogleGenAI({ apiKey: geminiApiKey })
  const contents: Content[] = [...history, createUserContent(message)]

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.models.generateContent({
        model: MODEL,
        contents,
        config: { systemInstruction: SYSTEM_INSTRUCTION, tools: TOOLS },
      })

      const calls = response.functionCalls
      if (!calls || calls.length === 0) {
        const reply = response.text ?? 'Não consegui responder isso agora.'
        contents.push(createModelContent(reply))
        res.status(200).json({ reply, contents })
        return
      }

      // Reaproveita o content bruto da resposta (não reconstrói a partir de
      // `functionCalls`): modelos recentes do Gemini anexam um
      // `thoughtSignature` interno em cada parte de function call, e sem
      // ecoar esse campo de volta a próxima chamada falha com 400 ("missing
      // a thought_signature"). Confirmado empiricamente antes de fechar
      // esta fase.
      const modelContent = response.candidates?.[0]?.content
      contents.push(
        modelContent ?? { role: 'model', parts: calls.map((c) => createPartFromFunctionCall(c.name ?? '', c.args ?? {})) },
      )

      const responseParts = await Promise.all(
        calls.map(async (call) => {
          const args = (call.args ?? {}) as Record<string, unknown>
          let resultado: unknown
          if (call.name === 'consultar_vendas') resultado = await consultarVendas(supabase, args)
          else if (call.name === 'consultar_estoque') resultado = await consultarEstoque(supabase, args)
          else resultado = { error: `Ferramenta desconhecida: ${call.name}` }
          return createPartFromFunctionResponse(
            call.id ?? call.name ?? '',
            call.name ?? '',
            resultado as Record<string, unknown>,
          )
        }),
      )
      contents.push({ role: 'user', parts: responseParts })
    }

    res.status(200).json({
      reply: 'Essa pergunta ficou grande demais pra eu responder agora — tenta ser mais específico?',
      contents,
    })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Erro ao falar com a assistente.' })
  }
}
