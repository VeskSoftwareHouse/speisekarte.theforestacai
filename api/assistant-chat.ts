import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  GoogleGenAI,
  ApiError,
  createUserContent,
  createModelContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  type Content,
  type GenerateContentResponse,
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

/** Gerada a cada request (não uma constante) — é o que deixa o modelo calcular
 * datas relativas tipo "domingo passado" ou "dia 25" sozinho. */
function buildSystemInstruction(): string {
  const hoje = new Date().toISOString().slice(0, 10)
  return `Você é a assistente do Painel da Equipe da The Forest Açaí, um food truck de açaí na Suíça. Responda sempre em português, de forma direta e curta — quem está te lendo é a equipe no meio do expediente, não tem tempo pra textão.

Hoje é ${hoje} (AAAA-MM-DD). Quando a pergunta mencionar um dia específico (ex: "domingo passado", "dia 25", "ontem à noite"), calcule a data exata a partir de hoje e passe em data_inicio/data_fim na ferramenta consultar_vendas — não se limite ao parâmetro periodo quando o usuário pedir um dia específico.

Responda em texto simples, sem markdown: nunca use **negrito**, *itálico*, listas com "-"/"*" nem títulos com "#". Para listar itens (ex: produtos mais vendidos), use uma linha por item com números normais ("1. Açaí 300ml — 67 unidades"), sem nenhum asterisco.

Você só sabe o que as ferramentas disponíveis te contam. Nunca invente números — se a pergunta precisar de dado real, chame a ferramenta certa antes de responder. Você tem acesso a todo o painel da equipe: vendas/relatórios (consultar_vendas), estado atual dos pedidos (consultar_pedidos_atuais), cardápio e adicionais (consultar_cardapio), saldo de estoque (consultar_estoque), histórico de movimentações de estoque (consultar_movimentacoes_estoque), pedidos de compra (consultar_compras), fornecedores (consultar_fornecedores), perdas (consultar_perdas), contagens de inventário (consultar_inventarios), impostos (consultar_impostos), e gorjetas/usuários da equipe (consultar_configuracoes). Se o resultado de uma ferramenta não trouxer o dado que a pergunta pediu, isso significa que a informação não está disponível nessa ferramenta — nunca conclua "zero" ou "nenhum" por conta própria a partir disso; diga que não tem acesso a esse dado específico. Se a pergunta não tiver nada a ver com a operação desta loja, diga que só sabe responder sobre isso. Você ainda não sabe cadastrar nem editar nada — só consultar.`
}

const RETRY_DELAYS_MS = [800, 2000]

/** 503 (sobrecarga do modelo) e 429 (limite de taxa) são conhecidos por
 * passarem sozinhos em segundos — mesma lógica do retryLoad usado no painel
 * da equipe para o "JWT issued at future", só que aqui contra a API do
 * Gemini em vez do Supabase. */
async function generateContentComRetry(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
): Promise<GenerateContentResponse> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await client.models.generateContent(params)
    } catch (err) {
      const transitorio = err instanceof ApiError && (err.status === 503 || err.status === 429)
      if (!transitorio || tentativa >= RETRY_DELAYS_MS.length) throw err
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[tentativa]))
    }
  }
}

/** Rede de segurança: o modelo às vezes ignora a instrução de texto simples
 * e volta a usar markdown — isso limpa o que passar, em vez de confiar só
 * no prompt. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
}

/** Mesmos valores de PAID_STATUSES (@shared/types) — escritos direto aqui porque
 * `api/*.ts` não importa de `src/` de forma confiável (ver plano/estoque). */
const PAID_STATUSES = ['recebido', 'em_preparo', 'pronto', 'entregue']

/** "AAAA-MM-DD" -> meia-noite local daquele dia. Datas inválidas viram null (cai no período padrão). */
function parseDataLocal(data: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function periodoParaIntervalo(args: { periodo?: string; data_inicio?: string; data_fim?: string }): {
  inicio: Date
  fim: Date
} {
  const agora = new Date()
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const fimAberto = new Date(agora.getTime() + 1000)

  // Dia/intervalo específico (ex: "domingo passado") tem prioridade sobre o
  // atalho de `periodo` — é o que o system instruction pede pro modelo usar
  // quando a pergunta menciona uma data.
  const inicioEspecifico = args.data_inicio ? parseDataLocal(args.data_inicio) : null
  if (inicioEspecifico) {
    const fimEspecifico = args.data_fim ? parseDataLocal(args.data_fim) : null
    const fim = fimEspecifico ? new Date(fimEspecifico.getTime() + 24 * 60 * 60 * 1000) : new Date(inicioEspecifico.getTime() + 24 * 60 * 60 * 1000)
    return { inicio: inicioEspecifico, fim }
  }

  const periodo = args.periodo ?? 'hoje'
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
  preco_unitario: number
  menu_item_id: string | null
}
interface OrderRow {
  valor_pago: number | null
  gorjeta: number | null
  forma_pagamento: string | null
  criado_em: string
  order_items: OrderItemRow[] | null
}

async function consultarVendas(
  supabase: SupabaseClient,
  args: { periodo?: string; data_inicio?: string; data_fim?: string },
) {
  const { inicio, fim } = periodoParaIntervalo(args)
  const { data, error } = await supabase
    .from('orders')
    .select('valor_pago, gorjeta, forma_pagamento, criado_em, order_items(nome_item, quantidade, preco_unitario, menu_item_id)')
    .in('status', PAID_STATUSES)
    .gte('criado_em', inicio.toISOString())
    .lte('criado_em', fim.toISOString())
  if (error) return { error: error.message }

  const pedidos = (data ?? []) as unknown as OrderRow[]
  const faturamento = pedidos.reduce((soma, p) => soma + (p.valor_pago ?? 0), 0)
  const gorjetas = pedidos.reduce((soma, p) => soma + (p.gorjeta ?? 0), 0)

  const porProduto = new Map<string, number>()
  const porFormaPagamento = new Map<string, number>()
  const porHora = new Map<number, number>()
  for (const pedido of pedidos) {
    const forma = pedido.forma_pagamento ?? 'Não informado'
    porFormaPagamento.set(forma, (porFormaPagamento.get(forma) ?? 0) + (pedido.valor_pago ?? 0))
    const hora = new Date(pedido.criado_em).getHours()
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1)
    for (const item of pedido.order_items ?? []) {
      porProduto.set(item.nome_item, (porProduto.get(item.nome_item) ?? 0) + item.quantidade)
    }
  }

  // Faturamento por categoria: precisa de mais uma volta pra descobrir a
  // categoria de cada menu_item_id — só dispara se houve venda no período.
  const menuItemIds = [
    ...new Set(pedidos.flatMap((p) => (p.order_items ?? []).map((i) => i.menu_item_id).filter((id): id is string => !!id))),
  ]
  const porCategoria = new Map<string, number>()
  if (menuItemIds.length > 0) {
    const { data: itemsData } = await supabase.from('menu_items').select('id, categoria_id').in('id', menuItemIds)
    const categoriaIds = [...new Set((itemsData ?? []).map((i: { categoria_id: string }) => i.categoria_id))]
    const { data: catsData } = await supabase.from('categories').select('id, nome').in('id', categoriaIds)
    const nomeCategoriaPorItemId = new Map<string, string>()
    const nomeCategoriaPorId = new Map((catsData ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))
    for (const item of (itemsData ?? []) as { id: string; categoria_id: string }[]) {
      nomeCategoriaPorItemId.set(item.id, nomeCategoriaPorId.get(item.categoria_id) ?? 'Sem categoria')
    }
    for (const pedido of pedidos) {
      for (const item of pedido.order_items ?? []) {
        if (!item.menu_item_id) continue
        const categoria = nomeCategoriaPorItemId.get(item.menu_item_id) ?? 'Sem categoria'
        porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + item.preco_unitario * item.quantidade)
      }
    }
  }

  return {
    periodo_consultado: `${inicio.toISOString().slice(0, 10)} a ${new Date(fim.getTime() - 1).toISOString().slice(0, 10)}`,
    pedidos: pedidos.length,
    faturamento_chf: Number(faturamento.toFixed(2)),
    gorjetas_chf: Number(gorjetas.toFixed(2)),
    ticket_medio_chf: pedidos.length > 0 ? Number((faturamento / pedidos.length).toFixed(2)) : 0,
    produtos_vendidos: [...porProduto.entries()]
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade),
    faturamento_por_forma_pagamento: [...porFormaPagamento.entries()].map(([forma, chf]) => ({
      forma,
      faturamento_chf: Number(chf.toFixed(2)),
    })),
    faturamento_por_categoria: [...porCategoria.entries()]
      .map(([categoria, chf]) => ({ categoria, faturamento_chf: Number(chf.toFixed(2)) }))
      .sort((a, b) => b.faturamento_chf - a.faturamento_chf),
    // Ordenado da hora mais cheia para a mais fraca — o modelo não precisa
    // comparar os 24 valores sozinho pra achar o pico.
    pedidos_por_hora: [...porHora.entries()]
      .map(([hora, pedidos]) => ({ hora: `${String(hora).padStart(2, '0')}h`, pedidos }))
      .sort((a, b) => b.pedidos - a.pedidos),
  }
}

async function consultarCardapio(supabase: SupabaseClient, args: { categoria?: string; apenas_disponiveis?: boolean }) {
  const { data: categorias, error: catErr } = await supabase.from('categories').select('id, nome').order('ordem')
  if (catErr) return { error: catErr.message }

  let query = supabase.from('menu_items').select('nome, preco, disponivel, destaque, categoria_id').order('ordem')
  if (args.apenas_disponiveis) query = query.eq('disponivel', true)
  const { data: itens, error: itensErr } = await query
  if (itensErr) return { error: itensErr.message }

  const nomeCategoriaPorId = new Map((categorias ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))
  let produtos = (itens ?? []).map((i: { nome: string; preco: number; disponivel: boolean; destaque: boolean; categoria_id: string }) => ({
    nome: i.nome,
    categoria: nomeCategoriaPorId.get(i.categoria_id) ?? 'Sem categoria',
    preco_chf: i.preco,
    disponivel: i.disponivel,
    destaque: i.destaque,
  }))
  if (args.categoria) {
    const termo = args.categoria.toLowerCase()
    produtos = produtos.filter((p) => p.categoria.toLowerCase().includes(termo))
  }

  const [gruposRes, opcoesRes] = await Promise.all([
    supabase.from('modifiers').select('id, nome, tipo, selecao').order('nome'),
    supabase.from('modifier_options').select('modifier_id, nome, preco_adicional').order('ordem'),
  ])
  if (gruposRes.error) return { error: gruposRes.error.message }
  if (opcoesRes.error) return { error: opcoesRes.error.message }

  const opcoesPorGrupo = new Map<string, { nome: string; preco_adicional_chf: number }[]>()
  for (const o of (opcoesRes.data ?? []) as { modifier_id: string; nome: string; preco_adicional: number }[]) {
    const lista = opcoesPorGrupo.get(o.modifier_id) ?? []
    lista.push({ nome: o.nome, preco_adicional_chf: o.preco_adicional })
    opcoesPorGrupo.set(o.modifier_id, lista)
  }
  const gruposAdicionais = ((gruposRes.data ?? []) as { id: string; nome: string; tipo: string; selecao: string }[]).map(
    (g) => ({
      grupo: g.nome,
      obrigatorio: g.tipo === 'obrigatorio',
      selecao_multipla: g.selecao === 'multipla',
      opcoes: opcoesPorGrupo.get(g.id) ?? [],
    }),
  )

  return {
    total_produtos: produtos.length,
    total_disponiveis: produtos.filter((p) => p.disponivel).length,
    categorias: (categorias ?? []).map((c: { nome: string }) => c.nome),
    produtos,
    total_adicionais: gruposAdicionais.reduce((soma, g) => soma + g.opcoes.length, 0),
    grupos_adicionais: gruposAdicionais,
  }
}

interface PedidoAtualRow {
  status: string
  nome_cliente: string | null
  valor_pago: number | null
  criado_em: string
}

async function consultarPedidosAtuais(supabase: SupabaseClient, args: { nome_cliente?: string }) {
  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)

  const [hojeRes, dinheiroRes] = await Promise.all([
    supabase
      .from('orders')
      .select('status, nome_cliente, valor_pago, criado_em')
      .in('status', PAID_STATUSES)
      .gte('criado_em', inicioHoje.toISOString()),
    supabase.from('orders').select('status, nome_cliente, valor_pago, criado_em').eq('status', 'aguardando_dinheiro'),
  ])
  if (hojeRes.error) return { error: hojeRes.error.message }
  if (dinheiroRes.error) return { error: dinheiroRes.error.message }

  const hoje = (hojeRes.data ?? []) as PedidoAtualRow[]
  const contagemPorStatus: Record<string, number> = {}
  for (const p of hoje) contagemPorStatus[p.status] = (contagemPorStatus[p.status] ?? 0) + 1

  const resultado: Record<string, unknown> = {
    pedidos_hoje_por_status: contagemPorStatus,
    aguardando_confirmacao_dinheiro: (dinheiroRes.data ?? []).length,
  }

  if (args.nome_cliente) {
    const termo = args.nome_cliente.toLowerCase()
    const todos = [...hoje, ...((dinheiroRes.data ?? []) as PedidoAtualRow[])]
    resultado.pedidos_encontrados = todos
      .filter((p) => p.nome_cliente?.toLowerCase().includes(termo))
      .map((p) => ({ nome_cliente: p.nome_cliente, status: p.status, valor_chf: p.valor_pago, criado_em: p.criado_em }))
  }

  return resultado
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

interface MovimentacaoRow {
  insumo_id: string
  quantidade: number
  tipo: string
  criado_em: string
}

async function consultarMovimentacoesEstoque(
  supabase: SupabaseClient,
  args: { periodo?: string; insumo?: string },
) {
  const { inicio, fim } = periodoParaIntervalo(args)
  const { data, error } = await supabase
    .from('movimentacoes_estoque')
    .select('insumo_id, quantidade, tipo, criado_em')
    .gte('criado_em', inicio.toISOString())
    .lte('criado_em', fim.toISOString())
    .order('criado_em', { ascending: false })
  if (error) return { error: error.message }

  let movimentos = (data ?? []) as MovimentacaoRow[]
  const insumoIds = [...new Set(movimentos.map((m) => m.insumo_id))]
  const { data: insumosData } = insumoIds.length
    ? await supabase.from('insumos').select('id, nome, unidade').in('id', insumoIds)
    : { data: [] as { id: string; nome: string; unidade: string }[] }
  const insumoPorId = new Map((insumosData ?? []).map((i: { id: string; nome: string; unidade: string }) => [i.id, i]))

  if (args.insumo) {
    const termo = args.insumo.toLowerCase()
    movimentos = movimentos.filter((m) => insumoPorId.get(m.insumo_id)?.nome.toLowerCase().includes(termo))
  }

  const porTipo = new Map<string, number>()
  for (const m of movimentos) porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + 1)

  return {
    periodo_consultado: `${inicio.toISOString().slice(0, 10)} a ${new Date(fim.getTime() - 1).toISOString().slice(0, 10)}`,
    total_movimentacoes: movimentos.length,
    por_tipo: [...porTipo.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade })),
    movimentacoes_recentes: movimentos.slice(0, 20).map((m) => {
      const insumo = insumoPorId.get(m.insumo_id)
      return {
        insumo: insumo?.nome ?? 'Insumo removido',
        quantidade: m.quantidade,
        unidade: insumo?.unidade,
        tipo: m.tipo,
        data: m.criado_em,
      }
    }),
  }
}

interface PedidoCompraRow {
  status: string
  fornecedor_id: string
  criado_em: string
  pedido_compra_itens: { quantidade: number; valor_unitario: number | null }[] | null
}

async function consultarCompras(supabase: SupabaseClient, args: { status?: string }) {
  let query = supabase
    .from('pedidos_compra')
    .select('status, fornecedor_id, criado_em, pedido_compra_itens(quantidade, valor_unitario)')
    .order('criado_em', { ascending: false })
    .limit(30)
  if (args.status) query = query.eq('status', args.status)
  const { data, error } = await query
  if (error) return { error: error.message }

  const pedidos = (data ?? []) as unknown as PedidoCompraRow[]
  const fornecedorIds = [...new Set(pedidos.map((p) => p.fornecedor_id))]
  const { data: fornecedoresData } = fornecedorIds.length
    ? await supabase.from('fornecedores').select('id, nome').in('id', fornecedorIds)
    : { data: [] as { id: string; nome: string }[] }
  const nomeFornecedorPorId = new Map((fornecedoresData ?? []).map((f: { id: string; nome: string }) => [f.id, f.nome]))

  const porStatus = new Map<string, number>()
  for (const p of pedidos) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1)

  return {
    total_pedidos: pedidos.length,
    por_status: [...porStatus.entries()].map(([status, quantidade]) => ({ status, quantidade })),
    pedidos: pedidos.map((p) => ({
      fornecedor: nomeFornecedorPorId.get(p.fornecedor_id) ?? 'Fornecedor removido',
      status: p.status,
      total_chf: Number(
        (p.pedido_compra_itens ?? []).reduce((soma, it) => soma + (it.valor_unitario ?? 0) * it.quantidade, 0).toFixed(2),
      ),
      criado_em: p.criado_em,
    })),
  }
}

async function consultarFornecedores(supabase: SupabaseClient, args: { apenas_ativos?: boolean }) {
  let query = supabase.from('fornecedores').select('nome, contato, telefone, email, ativo').order('nome')
  if (args.apenas_ativos) query = query.eq('ativo', true)
  const { data, error } = await query
  if (error) return { error: error.message }
  return { total: (data ?? []).length, fornecedores: data ?? [] }
}

interface PerdaRow {
  insumo_id: string
  quantidade: number
  motivo: string
  origem_tipo: string
  criado_em: string
}

async function consultarPerdas(supabase: SupabaseClient, args: { periodo?: string }) {
  const { inicio, fim } = periodoParaIntervalo(args)
  const { data, error } = await supabase
    .from('perdas')
    .select('insumo_id, quantidade, motivo, origem_tipo, criado_em')
    .gte('criado_em', inicio.toISOString())
    .lte('criado_em', fim.toISOString())
  if (error) return { error: error.message }

  const perdas = (data ?? []) as PerdaRow[]
  const insumoIds = [...new Set(perdas.map((p) => p.insumo_id))]
  const { data: insumosData } = insumoIds.length
    ? await supabase.from('insumos').select('id, nome, unidade').in('id', insumoIds)
    : { data: [] as { id: string; nome: string; unidade: string }[] }
  const insumoPorId = new Map((insumosData ?? []).map((i: { id: string; nome: string; unidade: string }) => [i.id, i]))

  const porMotivo = new Map<string, number>()
  for (const p of perdas) porMotivo.set(p.motivo, (porMotivo.get(p.motivo) ?? 0) + 1)

  return {
    periodo_consultado: `${inicio.toISOString().slice(0, 10)} a ${new Date(fim.getTime() - 1).toISOString().slice(0, 10)}`,
    total_perdas: perdas.length,
    por_motivo: [...porMotivo.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })),
    perdas: perdas.map((p) => {
      const insumo = insumoPorId.get(p.insumo_id)
      return {
        insumo: insumo?.nome ?? 'Insumo removido',
        quantidade: p.quantidade,
        unidade: insumo?.unidade,
        motivo: p.motivo,
        origem: p.origem_tipo,
        data: p.criado_em,
      }
    }),
  }
}

async function consultarInventarios(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('inventarios')
    .select('observacoes, criado_em, finalizado_em, inventario_itens(saldo_sistema, saldo_contado)')
    .order('criado_em', { ascending: false })
    .limit(10)
  if (error) return { error: error.message }

  const inventarios = (data ?? []) as {
    observacoes: string | null
    criado_em: string
    finalizado_em: string | null
    inventario_itens: { saldo_sistema: number; saldo_contado: number }[] | null
  }[]

  return {
    total_contagens: inventarios.length,
    contagens: inventarios.map((inv) => ({
      data: inv.criado_em,
      finalizada: !!inv.finalizado_em,
      insumos_contados: (inv.inventario_itens ?? []).length,
      divergencias: (inv.inventario_itens ?? []).filter((it) => it.saldo_contado !== it.saldo_sistema).length,
      observacoes: inv.observacoes,
    })),
  }
}

async function consultarImpostos(supabase: SupabaseClient) {
  const { data, error } = await supabase.from('impostos').select('nome, tipo, valor, insumo_id, ativo').order('nome')
  if (error) return { error: error.message }

  const impostos = (data ?? []) as { nome: string; tipo: string; valor: number; insumo_id: string | null; ativo: boolean }[]
  const insumoIds = [...new Set(impostos.map((i) => i.insumo_id).filter((id): id is string => !!id))]
  const { data: insumosData } = insumoIds.length
    ? await supabase.from('insumos').select('id, nome').in('id', insumoIds)
    : { data: [] as { id: string; nome: string }[] }
  const nomeInsumoPorId = new Map((insumosData ?? []).map((i: { id: string; nome: string }) => [i.id, i.nome]))

  return {
    total: impostos.length,
    impostos: impostos.map((i) => ({
      nome: i.nome,
      tipo: i.tipo,
      valor: i.valor,
      insumo_vinculado: i.insumo_id ? (nomeInsumoPorId.get(i.insumo_id) ?? 'Insumo removido') : null,
      ativo: i.ativo,
    })),
  }
}

async function consultarConfiguracoes(supabase: SupabaseClient) {
  const [tipsRes, usersRes] = await Promise.all([
    supabase.from('tip_options').select('tipo, valor, ativo').order('ordem'),
    supabase.auth.admin.listUsers(),
  ])
  if (tipsRes.error) return { error: tipsRes.error.message }

  return {
    gorjetas: (tipsRes.data ?? []).map((t: { tipo: string; valor: number; ativo: boolean }) => ({
      tipo: t.tipo,
      valor: t.valor,
      ativo: t.ativo,
    })),
    total_usuarios_da_equipe: usersRes.data?.users?.length ?? null,
    usuarios_da_equipe: (usersRes.data?.users ?? []).map((u) => ({
      nome: (u.user_metadata as { nome?: string } | null)?.nome ?? null,
      email: u.email,
    })),
  }
}

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'consultar_vendas',
        description:
          'Consulta pedidos pagos num período: faturamento, gorjetas, ticket médio, produtos mais vendidos, faturamento por forma de pagamento e por categoria do cardápio, e quantidade de pedidos por hora do dia (já ordenado da hora mais cheia pra mais fraca). Para um dia ou intervalo específico (ex: "domingo passado"), use data_inicio/data_fim em vez de periodo.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            periodo: {
              type: 'string',
              enum: ['hoje', 'ontem', 'semana', 'mes'],
              description: 'Atalho de período. Ignorado se data_inicio for informado.',
            },
            data_inicio: {
              type: 'string',
              description: 'Data inicial no formato AAAA-MM-DD, calculada a partir de "hoje" quando o usuário menciona um dia específico.',
            },
            data_fim: {
              type: 'string',
              description: 'Data final (inclusive) no formato AAAA-MM-DD. Se omitida, usa o mesmo dia de data_inicio.',
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
      {
        name: 'consultar_cardapio',
        description:
          'Consulta o cardápio cadastrado: produtos, categorias, preços, disponibilidade, destaque, e também os grupos de adicionais/misturas (ex: Frutas, Toppings) com suas opções e preço adicional. Não tem relação com vendas — é o catálogo, vendido ou não.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            categoria: { type: 'string', description: 'Nome (ou parte do nome) de uma categoria específica.' },
            apenas_disponiveis: { type: 'boolean', description: 'Se true, lista só os produtos disponíveis no totem.' },
          },
        },
      },
      {
        name: 'consultar_pedidos_atuais',
        description:
          'Consulta o estado operacional agora: quantos pedidos estão em cada etapa da cozinha hoje (recebido/em preparo/pronto/entregue) e quantos aguardam confirmação de pagamento em dinheiro. Também busca um pedido específico pelo nome do cliente.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_cliente: {
              type: 'string',
              description: 'Nome (ou parte do nome) de um cliente, para achar o(s) pedido(s) dele.',
            },
          },
        },
      },
      {
        name: 'consultar_movimentacoes_estoque',
        description:
          'Consulta o histórico de movimentações de estoque (entradas e saídas de insumos) num período: quantas aconteceram, de que tipo (compra, venda, ajuste de inventário, perda, manual) e as mais recentes.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes'], description: 'Período a consultar. Padrão: hoje.' },
            insumo: { type: 'string', description: 'Nome (ou parte do nome) de um insumo específico.' },
          },
        },
      },
      {
        name: 'consultar_compras',
        description: 'Consulta pedidos de compra a fornecedores: quantos existem, em que status, e o valor de cada um.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['rascunho', 'aguardando_recebimento', 'recebido', 'cancelado'],
              description: 'Filtra por status. Deixe vazio para ver todos os pedidos recentes.',
            },
          },
        },
      },
      {
        name: 'consultar_fornecedores',
        description: 'Consulta os fornecedores cadastrados (nome, contato, ativo/inativo).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            apenas_ativos: { type: 'boolean', description: 'Se true, lista só os fornecedores ativos.' },
          },
        },
      },
      {
        name: 'consultar_perdas',
        description: 'Consulta as perdas de estoque registradas num período: quantas, por qual motivo, e de qual insumo.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            periodo: { type: 'string', enum: ['hoje', 'ontem', 'semana', 'mes'], description: 'Período a consultar. Padrão: hoje.' },
          },
        },
      },
      {
        name: 'consultar_inventarios',
        description: 'Consulta o histórico de contagens de inventário (contagem física de estoque): quando, quantos insumos contados e quantas divergências encontradas.',
        parametersJsonSchema: { type: 'object', properties: {} },
      },
      {
        name: 'consultar_impostos',
        description: 'Consulta os impostos cadastrados: nome, tipo (fixo/percentual), valor, e a qual insumo (se algum) estão vinculados.',
        parametersJsonSchema: { type: 'object', properties: {} },
      },
      {
        name: 'consultar_configuracoes',
        description: 'Consulta as opções de gorjeta oferecidas no totem e a lista de usuários com acesso ao painel da equipe.',
        parametersJsonSchema: { type: 'object', properties: {} },
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
  const systemInstruction = buildSystemInstruction()

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await generateContentComRetry(client, {
        model: MODEL,
        contents,
        config: { systemInstruction, tools: TOOLS },
      })

      const calls = response.functionCalls
      if (!calls || calls.length === 0) {
        const reply = stripMarkdown(response.text ?? 'Não consegui responder isso agora.')
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
          else if (call.name === 'consultar_cardapio') resultado = await consultarCardapio(supabase, args)
          else if (call.name === 'consultar_pedidos_atuais') resultado = await consultarPedidosAtuais(supabase, args)
          else if (call.name === 'consultar_movimentacoes_estoque') resultado = await consultarMovimentacoesEstoque(supabase, args)
          else if (call.name === 'consultar_compras') resultado = await consultarCompras(supabase, args)
          else if (call.name === 'consultar_fornecedores') resultado = await consultarFornecedores(supabase, args)
          else if (call.name === 'consultar_perdas') resultado = await consultarPerdas(supabase, args)
          else if (call.name === 'consultar_inventarios') resultado = await consultarInventarios(supabase)
          else if (call.name === 'consultar_impostos') resultado = await consultarImpostos(supabase)
          else if (call.name === 'consultar_configuracoes') resultado = await consultarConfiguracoes(supabase)
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
    // O SDK propaga o corpo cru do erro da API do Gemini na mensagem (JSON
    // com "status"/"code") — nunca mostra isso direto pra equipe. Sobrecarga
    // já tenta de novo sozinha (ver generateContentComRetry); se ainda assim
    // falhar, é porque persistiu além das tentativas.
    const sobrecarga = err instanceof ApiError && (err.status === 503 || err.status === 429)
    res.status(502).json({
      error: sobrecarga
        ? 'A IA está sobrecarregada agora. Espera alguns segundos e tenta de novo.'
        : 'Não consegui falar com a assistente agora. Tenta de novo em instantes.',
    })
  }
}
