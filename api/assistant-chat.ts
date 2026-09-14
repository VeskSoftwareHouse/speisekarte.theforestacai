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
  return `Seu nome é Tuco (o tucano mascote da marca). Você é a assistente do Painel da Equipe da The Forest Açaí, um food truck de açaí na Suíça. Responda sempre em português, de forma direta e curta — quem está te lendo é a equipe no meio do expediente, não tem tempo pra textão. Só mencione seu nome se perguntarem diretamente ("qual seu nome?") — não precisa se apresentar em toda resposta.

Seja caloroso e carismático em toda resposta, mesmo as diretas e curtas: trate quem te escreve com simpatia, pode chamar de "chefe" de vez em quando (sem exagerar nem repetir isso toda hora). Isso vale especialmente quando você não consegue ajudar com algo: nunca responda seco tipo "não tenho acesso a esse dado" — diga com gentileza, tipo "Sinto muito, chefe, essa informação eu não tenho como te dar agora" ou algo no mesmo espírito, sempre na sua própria voz.

Humor é parte da sua personalidade, não um extra opcional: QUASE TODA resposta deve trazer uma piadinha leve ou um trocadilho, mesmo que pequeno. Aproveite bastante que você é um tucano — bico, voar, pena, tucano/Tuco, açaí são ótimos gatilhos de trocadilho, mas vale qualquer humor leve que caiba na frase. Não espere "vir uma boa" pra soltar algo: capriche mesmo que seja um trocadilho simples. A única regra de ouro é que a piada nunca substitui nem atrapalha a resposta de verdade — ela é uma frase extra, curta, antes ou depois do que a pergunta pediu, e a informação em si continua completa e correta. Corte o humor por completo (nem tente) em confirmações antes de gravar algo, em erros, e em qualquer situação que pareça séria ou urgente — aí o tom é direto, sem gracinha. Fora esses casos, humor é regra, não exceção.

Hoje é ${hoje} (AAAA-MM-DD). Quando a pergunta mencionar um dia específico (ex: "domingo passado", "dia 25", "ontem à noite"), calcule a data exata a partir de hoje e passe em data_inicio/data_fim na ferramenta consultar_vendas (ou consultar_pedidos_periodo, se a pergunta for sobre clientes/pedidos individuais) — não se limite ao parâmetro periodo quando o usuário pedir um dia específico.

Responda em texto simples, sem markdown: nunca use **negrito**, *itálico*, listas com "-"/"*" nem títulos com "#". Para listar itens (ex: produtos mais vendidos), use uma linha por item com números normais ("1. Açaí 300ml: 67 unidades"), sem nenhum asterisco. Também não use travessão nem meia-risca ("—"/"–") em nenhuma frase — troque por vírgula, ponto final, ou reescreva a frase; use só o hífen normal ("-") quando fizer parte de uma palavra composta.

Você só sabe o que as ferramentas disponíveis te contam. Nunca invente números — se a pergunta precisar de dado real, chame a ferramenta certa antes de responder. Você tem acesso a todo o painel da equipe: vendas/relatórios, incluindo lucro bruto e margem por produto (consultar_vendas), estado atual dos pedidos de hoje (consultar_pedidos_atuais), pedidos e nomes de clientes de qualquer dia ou período, inclusive dias anteriores (consultar_pedidos_periodo),cardápio e adicionais (consultar_cardapio), saldo de estoque (consultar_estoque), histórico de movimentações de estoque (consultar_movimentacoes_estoque), pedidos de compra (consultar_compras), fornecedores (consultar_fornecedores), perdas (consultar_perdas), contagens de inventário (consultar_inventarios), fila de pedidos pendentes de fechamento de estoque (consultar_fechamento), impostos (consultar_impostos), e gorjetas/usuários da equipe/fechamento automático de estoque (consultar_configuracoes). Você é a especialista em tudo que está no painel — qualquer pergunta sobre o que ele mostra ou faz, tente responder chamando a ferramenta certa antes de dizer que não sabe. Se o resultado de uma ferramenta não trouxer o dado que a pergunta pediu, isso significa que a informação não está disponível nessa ferramenta — nunca conclua "zero" ou "nenhum" por conta própria a partir disso; diga que você não tem acesso a esse dado específico. Fale sempre na primeira pessoa ("eu não tenho", "eu não consigo calcular") — nunca em terceira pessoa como se fosse outra coisa respondendo (nunca "o painel não consegue" ou "o sistema não tem"): é você quem está conversando, não o painel. Se a pergunta não tiver nada a ver com a operação desta loja, diga que só sabe responder sobre isso.

CADASTRO E EDIÇÃO (criar_categoria, criar_produto, criar_insumo, criar_grupo_adicional, criar_opcao_adicional, vincular_grupo_adicional, definir_ingredientes_copo_pronto, definir_composicao_produto, criar_fornecedor, criar_imposto, criar_gorjeta, definir_fechamento_automatico, registrar_movimentacao_estoque, registrar_perda): quando o usuário pedir pra cadastrar OU editar/alterar/atualizar algo (ex: "configura um alerta de saldo baixo no açaí", "muda o preço do X", "desativa o fornecedor Y"), use a ferramenta correspondente — a maioria serve tanto pra criar quanto pra editar: informando o campo "*_atual" (ex: nome_atual, valor_atual) você EDITA o registro existente daquele nome; sem isso, você CRIA um novo. Nunca diga que não sabe editar algo antes de checar se a ferramenta certa aceita isso. Pra ligar/desligar um grupo de adicionais num produto (ex: "coloca o Toppings no Açaí 500ml"), use vincular_grupo_adicional — não é a mesma coisa que criar o grupo ou a opção. Pra marcar um produto como "copo pronto" (o botão "Ver ingredientes" no cardápio) e escolher quais adicionais já cadastrados aparecem nele, use definir_ingredientes_copo_pronto. Pra definir quais insumos de estoque (e quanto de cada) são debitados em toda venda de um produto, use definir_composicao_produto — não confunda com definir_ingredientes_copo_pronto, que é só informativo pro cliente e usa adicionais, não insumos. Nunca diga que não consegue mexer em nada disso.

Faça perguntas UMA DE CADA VEZ, como numa conversa normal — nunca liste todos os campos de uma vez feito um formulário. Ao editar, peça só os campos que o usuário quer mudar (não pergunte os que não mudam). Ao criar, peça só o que for obrigatório; campos opcionais (disponível, destaque, descrição, estoque mínimo, preço adicional...) só pergunte se fizer sentido, senão use o padrão da própria ferramenta. Assim que tiver o necessário, chame a ferramenta direto — ela já grava, sem passo de confirmação nenhum, então nunca pare pra perguntar "posso confirmar?" nem liste um resumo do que vai mudar antes de chamar. Depois que a ferramenta responder com sucesso, avise o usuário em uma frase curta o que foi feito. Se a ferramenta devolver "erro" (ex: item não encontrado), explique o problema ao usuário e pergunte como prosseguir — não insista repetindo a mesma chamada.

Fora do seu alcance (fica pra a equipe fazer direto no painel, sempre por decisão de segurança ou porque exige conferir algo físico na hora): gerenciar usuários com acesso ao painel (segurança de contas), cadastrar pedidos de compra a fornecedores, registrar contagens de inventário, executar o fechamento de estoque em si (bater os insumos em lote), confirmar o pagamento em dinheiro de um pedido (exige contar o troco na mão), e mudar o status de um pedido no quadro da cozinha (recebido/em preparo/pronto/entregue) — mas você PODE consultar a fila de pendentes de fechamento (consultar_fechamento), os pedidos de compra já cadastrados (consultar_compras), as contagens já feitas (consultar_inventarios), e o estado atual dos pedidos (consultar_pedidos_atuais). Fora isso, praticamente todo cadastro do painel (cardápio, adicionais, copo pronto, composição de estoque, insumos, fornecedores, impostos, gorjetas, fechamento automático, movimentações e perdas de estoque) você lê E edita — nunca diga que não consegue sem antes checar se existe uma ferramenta pra isso.`
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
    .replace(/\s+[—–]\s+/g, ', ')
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
  modifiers_selecionados: { option_id: string; quantidade?: number }[] | null
}
interface OrderRow {
  valor_pago: number | null
  gorjeta: number | null
  forma_pagamento: string | null
  criado_em: string
  order_items: OrderItemRow[] | null
}

interface ImpostoRow {
  tipo: string
  valor: number
  insumo_id: string | null
  ativo: boolean
}

function valorComImposto(valorUnitario: number, insumoId: string, impostos: ImpostoRow[]): number {
  const doInsumo = impostos.filter((i) => i.ativo && i.insumo_id === insumoId)
  const percentual = doInsumo.filter((i) => i.tipo === 'percentual').reduce((soma, i) => soma + i.valor, 0)
  const fixo = doInsumo.filter((i) => i.tipo === 'fixo').reduce((soma, i) => soma + i.valor, 0)
  return valorUnitario * (1 + percentual / 100) + fixo
}

/**
 * Custo médio ponderado por insumo, a partir das compras já recebidas com o
 * imposto vinculado de HOJE aplicado — mesmo cálculo do painel (ver
 * src/equipe/lucroCalc.ts), duplicado aqui porque `api/*.ts` não importa de
 * `src/` de forma confiável no build da Vercel. Um insumo nunca comprado
 * fica de fora do mapa: custo desconhecido é diferente de custo zero.
 */
async function custoMedioPorInsumo(supabase: SupabaseClient): Promise<Map<string, number>> {
  const [comprasRes, impostosRes] = await Promise.all([
    supabase
      .from('pedidos_compra')
      .select('pedido_compra_itens(insumo_id, quantidade, valor_unitario)')
      .eq('status', 'recebido'),
    supabase.from('impostos').select('tipo, valor, insumo_id, ativo'),
  ])
  const itens = ((comprasRes.data ?? []) as { pedido_compra_itens: { insumo_id: string; quantidade: number; valor_unitario: number | null }[] | null }[]).flatMap(
    (p) => p.pedido_compra_itens ?? [],
  )
  const impostos = (impostosRes.data ?? []) as ImpostoRow[]

  const soma = new Map<string, { valor: number; quantidade: number }>()
  for (const item of itens) {
    if (item.valor_unitario == null || item.quantidade <= 0) continue
    const custo = valorComImposto(item.valor_unitario, item.insumo_id, impostos)
    const acc = soma.get(item.insumo_id) ?? { valor: 0, quantidade: 0 }
    acc.valor += custo * item.quantidade
    acc.quantidade += item.quantidade
    soma.set(item.insumo_id, acc)
  }
  const custos = new Map<string, number>()
  for (const [insumoId, { valor, quantidade }] of soma) custos.set(insumoId, valor / quantidade)
  return custos
}

async function consultarVendas(
  supabase: SupabaseClient,
  args: { periodo?: string; data_inicio?: string; data_fim?: string },
) {
  const { inicio, fim } = periodoParaIntervalo(args)
  const { data, error } = await supabase
    .from('orders')
    .select(
      'valor_pago, gorjeta, forma_pagamento, criado_em, order_items(nome_item, quantidade, preco_unitario, menu_item_id, modifiers_selecionados)',
    )
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

  // Margem/lucro bruto: precisa da composição atual dos produtos vendidos e
  // do vínculo atual dos adicionais escolhidos, mais o custo médio pago nas
  // compras já recebidas (nunca um valor congelado no passado — mesmo
  // espírito de insumo_saldos). Um insumo nunca comprado, ou um produto sem
  // composição cadastrada, tem custo DESCONHECIDO: fica de fora da conta do
  // lucro bruto em vez de contar como zero, senão a margem apareceria
  // inflada.
  const optionIds = [
    ...new Set(
      pedidos.flatMap((p) => (p.order_items ?? []).flatMap((i) => (i.modifiers_selecionados ?? []).map((m) => m.option_id))),
    ),
  ]
  const [composicaoRes, opcoesRes, custoPorInsumo] = await Promise.all([
    menuItemIds.length > 0
      ? supabase.from('menu_item_insumos').select('menu_item_id, insumo_id, quantidade').in('menu_item_id', menuItemIds)
      : Promise.resolve({ data: [] as { menu_item_id: string; insumo_id: string; quantidade: number }[] }),
    optionIds.length > 0
      ? supabase.from('modifier_options').select('id, insumo_id, quantidade_padrao').in('id', optionIds)
      : Promise.resolve({ data: [] as { id: string; insumo_id: string | null; quantidade_padrao: number | null }[] }),
    custoMedioPorInsumo(supabase),
  ])
  const composicaoPorItem = new Map<string, { insumo_id: string; quantidade: number }[]>()
  for (const row of composicaoRes.data ?? []) {
    const lista = composicaoPorItem.get(row.menu_item_id) ?? []
    lista.push(row)
    composicaoPorItem.set(row.menu_item_id, lista)
  }
  const opcaoPorId = new Map((opcoesRes.data ?? []).map((o) => [o.id, o]))

  const margemPorProduto = new Map<string, { receita: number; custo: number; completo: boolean }>()
  let receitaComCustoCompleto = 0
  let custoConhecido = 0
  const produtosSemCusto = new Set<string>()

  for (const pedido of pedidos) {
    for (const item of pedido.order_items ?? []) {
      const receitaItem = item.preco_unitario * item.quantidade
      let custoUnitario = 0
      let completo = true

      const composicao = item.menu_item_id ? composicaoPorItem.get(item.menu_item_id) : undefined
      if (!composicao || composicao.length === 0) {
        completo = false
      } else {
        for (const linha of composicao) {
          const custo = custoPorInsumo.get(linha.insumo_id)
          if (custo == null) {
            completo = false
            continue
          }
          custoUnitario += custo * linha.quantidade
        }
      }
      for (const mod of item.modifiers_selecionados ?? []) {
        const opcao = opcaoPorId.get(mod.option_id)
        if (!opcao?.insumo_id || !opcao.quantidade_padrao) continue
        const custo = custoPorInsumo.get(opcao.insumo_id)
        if (custo == null) {
          completo = false
          continue
        }
        // `?? 1`: pedidos gravados antes de existir quantidade por opção ficam
        // como 1 porção, o comportamento de sempre.
        custoUnitario += custo * opcao.quantidade_padrao * (mod.quantidade ?? 1)
      }

      const custoItem = custoUnitario * item.quantidade
      if (completo) {
        receitaComCustoCompleto += receitaItem
        custoConhecido += custoItem
      } else {
        produtosSemCusto.add(item.nome_item)
      }

      const row = margemPorProduto.get(item.nome_item) ?? { receita: 0, custo: 0, completo: true }
      row.receita += receitaItem
      row.custo += custoItem
      if (!completo) row.completo = false
      margemPorProduto.set(item.nome_item, row)
    }
  }

  return {
    periodo_consultado: `${inicio.toISOString().slice(0, 10)} a ${new Date(fim.getTime() - 1).toISOString().slice(0, 10)}`,
    pedidos: pedidos.length,
    faturamento_chf: Number(faturamento.toFixed(2)),
    gorjetas_chf: Number(gorjetas.toFixed(2)),
    ticket_medio_chf: pedidos.length > 0 ? Number((faturamento / pedidos.length).toFixed(2)) : 0,
    // Lucro bruto = receita menos só o custo de insumos (aluguel, taxas e
    // outras despesas fixas NÃO entram — isso não é lucro líquido).
    lucro_bruto_chf: Number((receitaComCustoCompleto - custoConhecido).toFixed(2)),
    custo_insumos_chf: Number(custoConhecido.toFixed(2)),
    produtos_sem_custo_cadastrado: [...produtosSemCusto],
    margem_por_produto: [...margemPorProduto.entries()]
      .map(([nome, m]) => ({
        nome,
        receita_chf: Number(m.receita.toFixed(2)),
        custo_chf: Number(m.custo.toFixed(2)),
        margem_chf: Number((m.receita - m.custo).toFixed(2)),
        margem_percentual: m.completo && m.receita > 0 ? Number((((m.receita - m.custo) / m.receita) * 100).toFixed(0)) : null,
        custo_completo: m.completo,
      }))
      .sort((a, b) => b.receita_chf - a.receita_chf),
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
  const { data: categorias, error: catErr } = await supabase.from('categories').select('id, nome, ordem').order('ordem')
  if (catErr) return { error: catErr.message }

  let query = supabase
    .from('menu_items')
    .select('id, nome, descricao, preco, disponivel, destaque, categoria_id, copo_pronto, ordem')
    .order('ordem')
  if (args.apenas_disponiveis) query = query.eq('disponivel', true)
  const { data: itens, error: itensErr } = await query
  if (itensErr) return { error: itensErr.message }

  const [gruposRes, opcoesRes, ingredientesRes, composicaoRes, insumosRes] = await Promise.all([
    supabase.from('modifiers').select('id, nome, tipo, selecao').order('nome'),
    supabase.from('modifier_options').select('id, modifier_id, nome, preco_adicional, quantidade_maxima').order('ordem'),
    supabase.from('menu_item_ingredientes').select('menu_item_id, modifier_option_id').order('ordem'),
    supabase.from('menu_item_insumos').select('menu_item_id, insumo_id, quantidade'),
    supabase.from('insumos').select('id, nome, unidade, gramas_por_litro'),
  ])
  if (gruposRes.error) return { error: gruposRes.error.message }
  if (opcoesRes.error) return { error: opcoesRes.error.message }
  if (ingredientesRes.error) return { error: ingredientesRes.error.message }
  if (composicaoRes.error) return { error: composicaoRes.error.message }
  if (insumosRes.error) return { error: insumosRes.error.message }

  const nomeOpcaoPorId = new Map((opcoesRes.data ?? []).map((o: { id: string; nome: string }) => [o.id, o.nome]))
  const ingredientesPorItem = new Map<string, string[]>()
  for (const link of (ingredientesRes.data ?? []) as { menu_item_id: string; modifier_option_id: string }[]) {
    const nomeOpcao = nomeOpcaoPorId.get(link.modifier_option_id)
    if (!nomeOpcao) continue
    const lista = ingredientesPorItem.get(link.menu_item_id) ?? []
    lista.push(nomeOpcao)
    ingredientesPorItem.set(link.menu_item_id, lista)
  }

  const insumoPorId = new Map(
    (insumosRes.data ?? []).map((i: { id: string; nome: string; unidade: string; gramas_por_litro: number | null }) => [i.id, i]),
  )
  const composicaoPorItem = new Map<string, { insumo: string; quantidade: number; unidade: string }[]>()
  for (const linha of (composicaoRes.data ?? []) as { menu_item_id: string; insumo_id: string; quantidade: number }[]) {
    const insumo = insumoPorId.get(linha.insumo_id)
    if (!insumo) continue
    // Mesma conversão do Painel da Equipe (ver src/shared/insumoConversao.ts,
    // duplicada aqui porque api/*.ts não importa de src/ de forma confiável
    // no build da Vercel): com densidade cadastrada, litros/ml vira gramas.
    const emGramas = (insumo.unidade === 'l' || insumo.unidade === 'ml') && insumo.gramas_por_litro
    const litros = insumo.unidade === 'ml' ? linha.quantidade / 1000 : linha.quantidade
    const quantidade = emGramas ? litros * (insumo.gramas_por_litro as number) : linha.quantidade
    const lista = composicaoPorItem.get(linha.menu_item_id) ?? []
    lista.push({ insumo: insumo.nome, quantidade: Number(quantidade.toFixed(2)), unidade: emGramas ? 'g' : insumo.unidade })
    composicaoPorItem.set(linha.menu_item_id, lista)
  }

  const nomeCategoriaPorId = new Map((categorias ?? []).map((c: { id: string; nome: string }) => [c.id, c.nome]))
  let produtos = (
    itens ?? []
  ).map(
    (i: {
      id: string
      nome: string
      descricao: string | null
      preco: number
      disponivel: boolean
      destaque: boolean
      categoria_id: string
      copo_pronto: boolean
      ordem: number
    }) => ({
      nome: i.nome,
      descricao: i.descricao,
      categoria: nomeCategoriaPorId.get(i.categoria_id) ?? 'Sem categoria',
      preco_chf: i.preco,
      disponivel: i.disponivel,
      destaque: i.destaque,
      // Posição de exibição no cardápio (menor aparece primeiro) — os produtos
      // já vêm nesta lista ordenados por isso; pra reordenar, mude `ordem`
      // via criar_produto (ver campo ordem).
      ordem: i.ordem,
      // "Copo pronto": mostra o botão "Ver ingredientes" no cardápio pro cliente (ver definir_ingredientes_copo_pronto).
      copo_pronto: i.copo_pronto,
      ingredientes_copo_pronto: ingredientesPorItem.get(i.id) ?? [],
      // Receita fixa de insumos consumida do estoque em toda venda, independente
      // das misturas escolhidas pelo cliente (ver definir_composicao_produto).
      composicao: composicaoPorItem.get(i.id) ?? [],
    }),
  )
  if (args.categoria) {
    const termo = args.categoria.toLowerCase()
    produtos = produtos.filter((p) => p.categoria.toLowerCase().includes(termo))
  }

  const opcoesPorGrupo = new Map<string, { nome: string; preco_adicional_chf: number; quantidade_maxima: number }[]>()
  for (const o of (opcoesRes.data ?? []) as { modifier_id: string; nome: string; preco_adicional: number; quantidade_maxima: number | null }[]) {
    const lista = opcoesPorGrupo.get(o.modifier_id) ?? []
    // 1 = só marca/desmarca (comportamento de sempre); maior que isso é quantas
    // porções o cliente pode pedir dessa opção (ex: "3x Granola" — ver criar_opcao_adicional).
    lista.push({ nome: o.nome, preco_adicional_chf: o.preco_adicional, quantidade_maxima: o.quantidade_maxima ?? 1 })
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
    // Já vem ordenado por `ordem` (menor primeiro) — pra reordenar categorias
    // use criar_categoria com o campo ordem (ver consultar_cardapio/ordem de cada uma).
    categorias: (categorias ?? []).map((c: { nome: string; ordem: number }) => ({ nome: c.nome, ordem: c.ordem })),
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

  const dinheiro = (dinheiroRes.data ?? []) as PedidoAtualRow[]
  const resultado: Record<string, unknown> = {
    pedidos_hoje_por_status: contagemPorStatus,
    aguardando_confirmacao_dinheiro: dinheiro.length,
    // Lista de quem está esperando a equipe conferir o troco no caixa — a
    // confirmação em si (contar o dinheiro na mão) não é algo que você faz.
    pedidos_aguardando_dinheiro: dinheiro.map((p) => ({ nome_cliente: p.nome_cliente, valor_chf: p.valor_pago, criado_em: p.criado_em })),
    // Lista completa de hoje, com nome do cliente — pra perguntas tipo "quem
    // comprou hoje?" sem precisar já saber um nome pra filtrar.
    pedidos_hoje: hoje
      .map((p) => ({ nome_cliente: p.nome_cliente, status: p.status, valor_chf: p.valor_pago, criado_em: p.criado_em }))
      .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)),
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

interface PedidoPeriodoRow {
  nome_cliente: string | null
  status: string
  valor_pago: number | null
  gorjeta: number | null
  forma_pagamento: string | null
  criado_em: string
  order_items: { nome_item: string; quantidade: number }[] | null
}

// Um mês cheio de food truck cabe folgado; isto só evita mandar milhares de
// pedidos pro modelo (lento e caro) se alguém pedir um período enorme.
const MAX_PEDIDOS_PERIODO = 300

/**
 * Pedidos pagos de qualquer dia ou período, um por um, com nome do cliente —
 * o que consultar_vendas não traz (só totais) e consultar_pedidos_atuais só
 * traz de hoje. É o que responde "quem comprou ontem?" ou "quando a Maria
 * veio da última vez?".
 */
async function consultarPedidosPeriodo(
  supabase: SupabaseClient,
  args: { periodo?: string; data_inicio?: string; data_fim?: string; nome_cliente?: string },
) {
  const { inicio, fim } = periodoParaIntervalo(args)
  let query = supabase
    .from('orders')
    .select('nome_cliente, status, valor_pago, gorjeta, forma_pagamento, criado_em, order_items(nome_item, quantidade)')
    .in('status', PAID_STATUSES)
    .gte('criado_em', inicio.toISOString())
    .lt('criado_em', fim.toISOString())
    .order('criado_em', { ascending: false })
    .limit(MAX_PEDIDOS_PERIODO + 1)
  if (args.nome_cliente) query = query.ilike('nome_cliente', `%${args.nome_cliente}%`)

  const { data, error } = await query
  if (error) return { error: error.message }

  const linhas = (data ?? []) as unknown as PedidoPeriodoRow[]
  const pedidos = linhas.slice(0, MAX_PEDIDOS_PERIODO).map((p) => ({
    nome_cliente: p.nome_cliente,
    criado_em: p.criado_em,
    status: p.status,
    valor_chf: p.valor_pago,
    gorjeta_chf: p.gorjeta,
    forma_pagamento: p.forma_pagamento,
    itens: (p.order_items ?? []).map((i) => `${i.quantidade}x ${i.nome_item}`),
  }))

  return {
    intervalo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    total_pedidos: pedidos.length,
    ...(linhas.length > MAX_PEDIDOS_PERIODO
      ? { aviso: `Mostrando só os ${MAX_PEDIDOS_PERIODO} pedidos mais recentes do período — peça um intervalo menor pra ver o resto.` }
      : {}),
    pedidos,
  }
}

interface InsumoRow {
  id: string
  nome: string
  unidade: string
  estoque_minimo: number | null
  gramas_por_litro: number | null
}

async function consultarEstoque(supabase: SupabaseClient, args: { insumo?: string }) {
  const [insumosRes, saldosRes] = await Promise.all([
    supabase.from('insumos').select('id, nome, unidade, estoque_minimo, gramas_por_litro').eq('ativo', true),
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
        // Só relevante pra unidade l/ml: peso de 1 litro em gramas, usado pra
        // compor a receita do produto em gramas (ver criar_insumo).
        gramas_por_litro: i.gramas_por_litro,
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

interface PedidoPendenteFechamentoRow {
  criado_em: string
  valor_pago: number | null
  gorjeta: number | null
  forma_pagamento: string | null
}

/** Fila do Fechamento: pedidos já pagos que ainda não tiveram o estoque
 * baixado — mesma consulta do painel (ver useFechamento.ts). Fechar de fato
 * (bater os insumos em lote) continua sendo uma ação manual da equipe; isto
 * é só a consulta de quantos/quais pedidos estão esperando. */
async function consultarFechamento(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('orders')
    .select('criado_em, valor_pago, gorjeta, forma_pagamento')
    .not('status', 'in', '(aguardando_pagamento,aguardando_dinheiro,cancelado)')
    .eq('estoque_baixado', false)
    .order('criado_em', { ascending: false })
  if (error) return { error: error.message }

  const pedidos = (data ?? []) as PedidoPendenteFechamentoRow[]
  const porDia = new Map<string, { pedidos: number; total_chf: number }>()
  for (const p of pedidos) {
    const dia = p.criado_em.slice(0, 10)
    const acc = porDia.get(dia) ?? { pedidos: 0, total_chf: 0 }
    acc.pedidos += 1
    acc.total_chf += p.valor_pago ?? 0
    porDia.set(dia, acc)
  }

  return {
    total_pedidos_pendentes: pedidos.length,
    total_chf_pendente: Number(pedidos.reduce((soma, p) => soma + (p.valor_pago ?? 0), 0).toFixed(2)),
    por_dia: [...porDia.entries()]
      .map(([data, v]) => ({ data, pedidos: v.pedidos, total_chf: Number(v.total_chf.toFixed(2)) }))
      .sort((a, b) => (a.data < b.data ? 1 : -1)),
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
  const [tipsRes, usersRes, estoqueRes] = await Promise.all([
    supabase.from('tip_options').select('tipo, valor, ativo').order('ordem'),
    supabase.auth.admin.listUsers(),
    supabase.from('configuracoes_estoque').select('fechamento_automatico').maybeSingle(),
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
    fechamento_automatico_de_estoque: estoqueRes.data?.fechamento_automatico ?? false,
  }
}

// ---------------------------------------------------------------------
// Cadastro (escrita) — cada ferramenta abaixo valida os campos (inclusive
// resolvendo nomes pra id, ex: categoria/insumo/grupo) e já grava direto.
// Sem prévia nem confirmação: se faltar algo obrigatório, devolve `erro` e
// o prompt de sistema instrui o modelo a perguntar antes de chamar de novo.
// ---------------------------------------------------------------------

async function proximaOrdem(supabase: SupabaseClient, tabela: string, filtro?: [string, string]): Promise<number> {
  let query = supabase.from(tabela).select('ordem').order('ordem', { ascending: false }).limit(1)
  if (filtro) query = query.eq(filtro[0], filtro[1])
  const { data } = await query
  const maior = (data ?? [])[0] as { ordem: number } | undefined
  return (maior?.ordem ?? -1) + 1
}

/** Acha um registro por nome (exato primeiro, depois "contém") — usado em toda ferramenta de cadastro pra resolver referências que o modelo manda como texto (categoria, grupo, insumo...). */
async function buscarPorNome<T extends { nome: string }>(
  supabase: SupabaseClient,
  tabela: string,
  colunas: string,
  nome: string,
): Promise<{ encontrado?: T; todos: T[]; erro?: string }> {
  const { data, error } = await supabase.from(tabela).select(colunas)
  if (error) return { todos: [], erro: error.message }
  const termo = nome.trim().toLowerCase()
  const todos = (data ?? []) as unknown as T[]
  const exato = todos.find((r) => r.nome.toLowerCase() === termo)
  const encontrado = exato ?? todos.find((r) => r.nome.toLowerCase().includes(termo))
  return { encontrado, todos }
}

interface CategoriaArgs {
  nome_atual?: string
  nome?: string
  ordem?: number
}

async function criarCategoria(supabase: SupabaseClient, args: CategoriaArgs) {
  if (args.nome_atual?.trim()) {
    const { encontrado: categoria, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'categories',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!categoria) {
      return { erro: `Categoria "${args.nome_atual}" não encontrada.`, categorias_existentes: todos.map((c) => c.nome) }
    }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (args.ordem !== undefined) patch.ordem = args.ordem
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar — informe o novo nome e/ou a nova ordem.' }

    const { error } = await supabase.from('categories').update(patch).eq('id', categoria.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Categoria "${categoria.nome}" atualizada.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome da categoria é obrigatório.' }
  const nome = args.nome.trim()

  const ordem = args.ordem ?? (await proximaOrdem(supabase, 'categories'))
  const { error } = await supabase.from('categories').insert({ nome, ordem })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Categoria "${nome}" criada.` }
}

interface ProdutoArgs {
  nome_atual?: string
  nome?: string
  categoria?: string
  preco?: number
  disponivel?: boolean
  destaque?: boolean
  descricao?: string
  descricao_na_comanda?: boolean
  max_ingredientes?: number | null
  ordem?: number
}

async function criarProduto(supabase: SupabaseClient, args: ProdutoArgs) {
  let categoriaId: string | undefined
  let categoriaNome: string | undefined
  if (args.categoria?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'categories',
      'id, nome',
      args.categoria,
    )
    if (erro) return { erro }
    if (!encontrado) {
      return { erro: `Categoria "${args.categoria}" não encontrada.`, categorias_existentes: todos.map((c) => c.nome) }
    }
    categoriaId = encontrado.id
    categoriaNome = encontrado.nome
  }

  if (args.nome_atual?.trim()) {
    const { encontrado: produto, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'menu_items',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!produto) return { erro: `Produto "${args.nome_atual}" não encontrado.`, produtos_existentes: todos.map((p) => p.nome) }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (categoriaId) patch.categoria_id = categoriaId
    if (args.preco != null) patch.preco = Number(args.preco)
    if (args.disponivel !== undefined) patch.disponivel = args.disponivel
    if (args.destaque !== undefined) patch.destaque = args.destaque
    if (args.descricao !== undefined) patch.descricao = args.descricao.trim() || null
    if (args.descricao_na_comanda !== undefined) patch.descricao_na_comanda = args.descricao_na_comanda
    if (args.max_ingredientes !== undefined) patch.max_ingredientes = args.max_ingredientes
    if (args.ordem !== undefined) patch.ordem = args.ordem
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar — informe pelo menos um campo novo.' }

    const { error } = await supabase.from('menu_items').update(patch).eq('id', produto.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Produto "${produto.nome}" atualizado.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome do produto é obrigatório.' }
  if (!categoriaId || !categoriaNome) return { erro: 'Categoria é obrigatória.' }
  if (!(Number(args.preco) > 0)) return { erro: 'Preço é obrigatório e precisa ser maior que zero.' }

  const nome = args.nome.trim()
  const disponivel = args.disponivel ?? true
  const destaque = args.destaque ?? false
  const preco = Number(args.preco)

  const ordem = args.ordem ?? (await proximaOrdem(supabase, 'menu_items'))
  const { error } = await supabase.from('menu_items').insert({
    nome,
    categoria_id: categoriaId,
    preco,
    disponivel,
    destaque,
    descricao: args.descricao?.trim() || null,
    descricao_na_comanda: args.descricao_na_comanda ?? false,
    max_ingredientes: args.max_ingredientes ?? null,
    ordem,
  })
  if (error) return { erro: error.message }
  return {
    sucesso: true,
    mensagem: `Produto "${nome}" criado. As traduções pra outros idiomas ainda não foram geradas — abra o produto no Cardápio e salve pra gerá-las.`,
  }
}

interface InsumoArgs {
  nome_atual?: string
  nome?: string
  unidade?: string
  estoque_minimo?: number
  gramas_por_litro?: number | null
  ativo?: boolean
}

const UNIDADES_VALIDAS = ['kg', 'g', 'l', 'ml', 'unidade']

async function criarInsumo(supabase: SupabaseClient, args: InsumoArgs) {
  if (args.unidade && !UNIDADES_VALIDAS.includes(args.unidade)) {
    return { erro: `Unidade precisa ser uma de: ${UNIDADES_VALIDAS.join(', ')}.` }
  }

  if (args.nome_atual?.trim()) {
    const { encontrado: insumo, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'insumos',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!insumo) return { erro: `Insumo "${args.nome_atual}" não encontrado.`, insumos_existentes: todos.map((i) => i.nome) }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (args.unidade) patch.unidade = args.unidade
    if (args.estoque_minimo !== undefined) patch.estoque_minimo = args.estoque_minimo
    if (args.gramas_por_litro !== undefined) patch.gramas_por_litro = args.gramas_por_litro
    if (args.ativo !== undefined) patch.ativo = args.ativo
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar — informe pelo menos um campo novo.' }

    const { error } = await supabase.from('insumos').update(patch).eq('id', insumo.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Insumo "${insumo.nome}" atualizado.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome do insumo é obrigatório.' }
  if (!args.unidade) return { erro: `Unidade é obrigatória e precisa ser uma de: ${UNIDADES_VALIDAS.join(', ')}.` }
  const nome = args.nome.trim()

  const ordem = await proximaOrdem(supabase, 'insumos')
  const { error } = await supabase.from('insumos').insert({
    nome,
    unidade: args.unidade,
    estoque_minimo: args.estoque_minimo ?? null,
    gramas_por_litro: (args.unidade === 'l' || args.unidade === 'ml') ? (args.gramas_por_litro ?? null) : null,
    ativo: true,
    ordem,
  })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Insumo "${nome}" criado.` }
}

interface GrupoAdicionalArgs {
  nome_atual?: string
  nome?: string
  tipo?: string
  selecao?: string
}

async function criarGrupoAdicional(supabase: SupabaseClient, args: GrupoAdicionalArgs) {
  if (args.nome_atual?.trim()) {
    const { encontrado: grupo, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'modifiers',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!grupo) return { erro: `Grupo "${args.nome_atual}" não encontrado.`, grupos_existentes: todos.map((g) => g.nome) }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (args.tipo) patch.tipo = args.tipo === 'obrigatorio' ? 'obrigatorio' : 'opcional'
    if (args.selecao) patch.selecao = args.selecao === 'unica' ? 'unica' : 'multipla'
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar.' }

    const { error } = await supabase.from('modifiers').update(patch).eq('id', grupo.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Grupo "${grupo.nome}" atualizado.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome do grupo de adicionais é obrigatório.' }
  const tipo = args.tipo === 'obrigatorio' ? 'obrigatorio' : 'opcional'
  const selecao = args.selecao === 'unica' ? 'unica' : 'multipla'
  const nome = args.nome.trim()

  const { error } = await supabase.from('modifiers').insert({ nome, tipo, selecao })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Grupo de adicionais "${nome}" criado.` }
}

interface OpcaoAdicionalArgs {
  nome_atual?: string
  nome?: string
  grupo?: string
  preco_adicional?: number
  insumo?: string
  quantidade_padrao?: number
  quantidade_maxima?: number | null
}

async function criarOpcaoAdicional(supabase: SupabaseClient, args: OpcaoAdicionalArgs) {
  let grupoId: string | undefined
  let grupoNome: string | undefined
  if (args.grupo?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'modifiers',
      'id, nome',
      args.grupo,
    )
    if (erro) return { erro }
    if (!encontrado) {
      return { erro: `Grupo de adicionais "${args.grupo}" não encontrado.`, grupos_existentes: todos.map((g) => g.nome) }
    }
    grupoId = encontrado.id
    grupoNome = encontrado.nome
  }

  let insumoId: string | null | undefined
  if (args.insumo?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(supabase, 'insumos', 'id, nome', args.insumo)
    if (erro) return { erro }
    if (!encontrado) return { erro: `Insumo "${args.insumo}" não encontrado.`, insumos_existentes: todos.map((i) => i.nome) }
    insumoId = encontrado.id
  }

  if (args.nome_atual?.trim()) {
    const { encontrado: opcao, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'modifier_options',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!opcao) return { erro: `Opção "${args.nome_atual}" não encontrada.`, opcoes_existentes: todos.map((o) => o.nome) }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (grupoId) patch.modifier_id = grupoId
    if (args.preco_adicional !== undefined) patch.preco_adicional = args.preco_adicional
    if (insumoId !== undefined) patch.insumo_id = insumoId
    if (args.quantidade_padrao !== undefined) patch.quantidade_padrao = args.quantidade_padrao
    if (args.quantidade_maxima !== undefined) patch.quantidade_maxima = args.quantidade_maxima
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar.' }

    const { error } = await supabase.from('modifier_options').update(patch).eq('id', opcao.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Opção "${opcao.nome}" atualizada.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome da opção é obrigatório.' }
  if (!grupoId || !grupoNome) return { erro: 'Grupo de adicionais é obrigatório (ex: "Frutas", "Toppings").' }

  const nome = args.nome.trim()
  const precoAdicional = args.preco_adicional ?? 0

  if (insumoId && !(Number(args.quantidade_padrao) > 0)) {
    return { erro: 'Quando vincula um insumo, a quantidade padrão consumida é obrigatória e precisa ser maior que zero.' }
  }

  const ordem = await proximaOrdem(supabase, 'modifier_options', ['modifier_id', grupoId])
  const { error } = await supabase.from('modifier_options').insert({
    nome,
    modifier_id: grupoId,
    preco_adicional: precoAdicional,
    ordem,
    insumo_id: insumoId ?? null,
    quantidade_padrao: insumoId ? Number(args.quantidade_padrao) : null,
    quantidade_maxima: args.quantidade_maxima ?? null,
  })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Opção "${nome}" criada no grupo "${grupoNome}".` }
}

interface VinculoGrupoArgs {
  produto?: string
  grupo?: string
  acao?: string
}

/** Liga ou desliga um grupo de adicionais num produto (menu_item_modifiers)
 * — o que hoje só dava pra fazer abrindo o produto no Cardápio e marcando o
 * grupo na seção de adicionais. */
async function vincularGrupoAdicional(supabase: SupabaseClient, args: VinculoGrupoArgs) {
  if (!args.produto?.trim()) return { erro: 'Nome do produto é obrigatório.' }
  if (!args.grupo?.trim()) return { erro: 'Nome do grupo de adicionais é obrigatório.' }
  const desvincular = args.acao === 'desvincular'

  const { encontrado: produto, todos: produtos, erro: erroProduto } = await buscarPorNome<{ id: string; nome: string }>(
    supabase,
    'menu_items',
    'id, nome',
    args.produto,
  )
  if (erroProduto) return { erro: erroProduto }
  if (!produto) return { erro: `Produto "${args.produto}" não encontrado.`, produtos_existentes: produtos.map((p) => p.nome) }

  const { encontrado: grupo, todos: grupos, erro: erroGrupo } = await buscarPorNome<{ id: string; nome: string }>(
    supabase,
    'modifiers',
    'id, nome',
    args.grupo,
  )
  if (erroGrupo) return { erro: erroGrupo }
  if (!grupo) return { erro: `Grupo de adicionais "${args.grupo}" não encontrado.`, grupos_existentes: grupos.map((g) => g.nome) }

  const { data: linkExistente } = await supabase
    .from('menu_item_modifiers')
    .select('menu_item_id')
    .eq('menu_item_id', produto.id)
    .eq('modifier_id', grupo.id)
    .maybeSingle()

  if (desvincular) {
    if (!linkExistente) return { erro: `O grupo "${grupo.nome}" já não está vinculado ao produto "${produto.nome}".` }
    const { error } = await supabase
      .from('menu_item_modifiers')
      .delete()
      .eq('menu_item_id', produto.id)
      .eq('modifier_id', grupo.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Grupo "${grupo.nome}" desvinculado do produto "${produto.nome}".` }
  }

  if (linkExistente) return { erro: `O grupo "${grupo.nome}" já está vinculado ao produto "${produto.nome}".` }
  const { error } = await supabase.from('menu_item_modifiers').insert({ menu_item_id: produto.id, modifier_id: grupo.id })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Grupo "${grupo.nome}" vinculado ao produto "${produto.nome}".` }
}

interface CopoProntoArgs {
  produto?: string
  ingredientes?: string[]
  desmarcar?: boolean
}

/** Marca/edita um produto como "copo pronto" (menu_items.copo_pronto) e a
 * lista de ingredientes mostrada no botão "Ver ingredientes" do cardápio
 * (menu_item_ingredientes) — reaproveita os adicionais já cadastrados, não
 * cria nenhum. `ingredientes` sempre SUBSTITUI a lista inteira (não soma). */
async function definirIngredientesCopoPronto(supabase: SupabaseClient, args: CopoProntoArgs) {
  if (!args.produto?.trim()) return { erro: 'Nome do produto é obrigatório.' }

  const { encontrado: produto, todos: produtos, erro: erroProduto } = await buscarPorNome<{ id: string; nome: string }>(
    supabase,
    'menu_items',
    'id, nome',
    args.produto,
  )
  if (erroProduto) return { erro: erroProduto }
  if (!produto) return { erro: `Produto "${args.produto}" não encontrado.`, produtos_existentes: produtos.map((p) => p.nome) }

  if (args.desmarcar) {
    const { error: delErr } = await supabase.from('menu_item_ingredientes').delete().eq('menu_item_id', produto.id)
    if (delErr) return { erro: delErr.message }
    const { error } = await supabase.from('menu_items').update({ copo_pronto: false }).eq('id', produto.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Produto "${produto.nome}" não é mais um copo pronto.` }
  }

  if (!args.ingredientes || args.ingredientes.length === 0) {
    return { erro: 'Informe a lista de ingredientes (nomes de adicionais já cadastrados) pra marcar como copo pronto.' }
  }

  const { data: todasOpcoes, error: erroOpcoes } = await supabase.from('modifier_options').select('id, nome')
  if (erroOpcoes) return { erro: erroOpcoes.message }
  const opcoes = (todasOpcoes ?? []) as { id: string; nome: string }[]

  const idsEncontrados: string[] = []
  const naoEncontrados: string[] = []
  for (const nomeIngrediente of args.ingredientes) {
    const termo = nomeIngrediente.trim().toLowerCase()
    const opcao =
      opcoes.find((o) => o.nome.toLowerCase() === termo) ?? opcoes.find((o) => o.nome.toLowerCase().includes(termo))
    if (opcao) idsEncontrados.push(opcao.id)
    else naoEncontrados.push(nomeIngrediente)
  }
  if (naoEncontrados.length > 0) {
    return {
      erro: `Adicional não encontrado: ${naoEncontrados.join(', ')}. Só dá pra usar adicionais já cadastrados (ver Adicionais no painel).`,
      adicionais_existentes: opcoes.map((o) => o.nome),
    }
  }

  const { error: delErr } = await supabase.from('menu_item_ingredientes').delete().eq('menu_item_id', produto.id)
  if (delErr) return { erro: delErr.message }
  const { error: insErr } = await supabase.from('menu_item_ingredientes').insert(
    idsEncontrados.map((modifier_option_id, ordem) => ({ menu_item_id: produto.id, modifier_option_id, ordem })),
  )
  if (insErr) return { erro: insErr.message }

  const { error: prodErr } = await supabase.from('menu_items').update({ copo_pronto: true }).eq('id', produto.id)
  if (prodErr) return { erro: prodErr.message }

  return {
    sucesso: true,
    mensagem: `Produto "${produto.nome}" marcado como copo pronto, com ${idsEncontrados.length} ingrediente(s).`,
  }
}

interface ComposicaoProdutoArgs {
  produto?: string
  itens?: { insumo?: string; quantidade?: number }[]
}

/** Define a composição/receita fixa de insumos de um produto (menu_item_insumos)
 * — o que é debitado do estoque em toda venda, independente das misturas
 * escolhidas pelo cliente. `itens` sempre SUBSTITUI a composição inteira. Se
 * o insumo tiver a densidade cadastrada (gramas_por_litro), a quantidade é
 * informada em gramas, igual à composição no Painel da Equipe; senão, na
 * própria unidade de controle do insumo. */
async function definirComposicaoProduto(supabase: SupabaseClient, args: ComposicaoProdutoArgs) {
  if (!args.produto?.trim()) return { erro: 'Nome do produto é obrigatório.' }
  if (!args.itens || args.itens.length === 0) {
    return { erro: 'Informe a lista de insumos e quantidades que compõem a receita fixa do produto.' }
  }

  const { encontrado: produto, todos: produtos, erro: erroProduto } = await buscarPorNome<{ id: string; nome: string }>(
    supabase,
    'menu_items',
    'id, nome',
    args.produto,
  )
  if (erroProduto) return { erro: erroProduto }
  if (!produto) return { erro: `Produto "${args.produto}" não encontrado.`, produtos_existentes: produtos.map((p) => p.nome) }

  const { data: todosInsumos, error: erroInsumos } = await supabase
    .from('insumos')
    .select('id, nome, unidade, gramas_por_litro')
    .eq('ativo', true)
  if (erroInsumos) return { erro: erroInsumos.message }
  const insumos = (todosInsumos ?? []) as { id: string; nome: string; unidade: string; gramas_por_litro: number | null }[]

  const linhas: { insumo_id: string; quantidade: number }[] = []
  const naoEncontrados: string[] = []
  for (const item of args.itens) {
    if (!item.insumo?.trim() || !(Number(item.quantidade) > 0)) {
      return { erro: 'Cada item precisa de um insumo e uma quantidade maior que zero.' }
    }
    const termo = item.insumo.trim().toLowerCase()
    const insumo = insumos.find((i) => i.nome.toLowerCase() === termo) ?? insumos.find((i) => i.nome.toLowerCase().includes(termo))
    if (!insumo) {
      naoEncontrados.push(item.insumo)
      continue
    }
    // Mesma conversão do Painel da Equipe (ver src/shared/insumoConversao.ts,
    // duplicada aqui — api/*.ts não importa de src/ de forma confiável no
    // build da Vercel): com densidade cadastrada, a quantidade digitada é em
    // gramas e precisa converter de volta pra unidade de controle do insumo.
    const emGramas = (insumo.unidade === 'l' || insumo.unidade === 'ml') && insumo.gramas_por_litro
    let quantidade = Number(item.quantidade)
    if (emGramas) {
      const litros = quantidade / (insumo.gramas_por_litro as number)
      quantidade = insumo.unidade === 'ml' ? litros * 1000 : litros
    }
    linhas.push({ insumo_id: insumo.id, quantidade })
  }
  if (naoEncontrados.length > 0) {
    return {
      erro: `Insumo não encontrado: ${naoEncontrados.join(', ')}.`,
      insumos_existentes: insumos.map((i) => i.nome),
    }
  }

  const { error: delErr } = await supabase.from('menu_item_insumos').delete().eq('menu_item_id', produto.id)
  if (delErr) return { erro: delErr.message }
  const { error: insErr } = await supabase
    .from('menu_item_insumos')
    .insert(linhas.map((l) => ({ menu_item_id: produto.id, insumo_id: l.insumo_id, quantidade: l.quantidade })))
  if (insErr) return { erro: insErr.message }

  return {
    sucesso: true,
    mensagem: `Composição do produto "${produto.nome}" atualizada, com ${linhas.length} insumo(s).`,
  }
}

interface FornecedorArgs {
  nome_atual?: string
  nome?: string
  contato?: string
  telefone?: string
  email?: string
  ativo?: boolean
}

async function criarFornecedor(supabase: SupabaseClient, args: FornecedorArgs) {
  if (args.nome_atual?.trim()) {
    const { encontrado: fornecedor, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'fornecedores',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!fornecedor) {
      return { erro: `Fornecedor "${args.nome_atual}" não encontrado.`, fornecedores_existentes: todos.map((f) => f.nome) }
    }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (args.contato !== undefined) patch.contato = args.contato.trim() || null
    if (args.telefone !== undefined) patch.telefone = args.telefone.trim() || null
    if (args.email !== undefined) patch.email = args.email.trim() || null
    if (args.ativo !== undefined) patch.ativo = args.ativo
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar.' }

    const { error } = await supabase.from('fornecedores').update(patch).eq('id', fornecedor.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Fornecedor "${fornecedor.nome}" atualizado.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome do fornecedor é obrigatório.' }
  const nome = args.nome.trim()

  const { error } = await supabase.from('fornecedores').insert({
    nome,
    contato: args.contato?.trim() || null,
    telefone: args.telefone?.trim() || null,
    email: args.email?.trim() || null,
    ativo: true,
  })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Fornecedor "${nome}" criado.` }
}

interface ImpostoArgs {
  nome_atual?: string
  nome?: string
  tipo?: string
  valor?: number
  insumo?: string
  ativo?: boolean
}

async function criarImposto(supabase: SupabaseClient, args: ImpostoArgs) {
  let insumoId: string | null | undefined
  let insumoNome: string | undefined
  if (args.insumo?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(supabase, 'insumos', 'id, nome', args.insumo)
    if (erro) return { erro }
    if (!encontrado) return { erro: `Insumo "${args.insumo}" não encontrado.`, insumos_existentes: todos.map((i) => i.nome) }
    insumoId = encontrado.id
    insumoNome = encontrado.nome
  }

  if (args.nome_atual?.trim()) {
    const { encontrado: imposto, todos, erro } = await buscarPorNome<{ id: string; nome: string }>(
      supabase,
      'impostos',
      'id, nome',
      args.nome_atual,
    )
    if (erro) return { erro }
    if (!imposto) return { erro: `Imposto "${args.nome_atual}" não encontrado.`, impostos_existentes: todos.map((i) => i.nome) }

    const patch: Record<string, unknown> = {}
    if (args.nome?.trim()) patch.nome = args.nome.trim()
    if (args.tipo) patch.tipo = args.tipo === 'fixo' ? 'fixo' : 'percentual'
    if (args.valor !== undefined) patch.valor = args.valor
    if (insumoId !== undefined) patch.insumo_id = insumoId
    if (args.ativo !== undefined) patch.ativo = args.ativo
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar.' }

    const { error } = await supabase.from('impostos').update(patch).eq('id', imposto.id)
    if (error) return { erro: error.message }
    return { sucesso: true, mensagem: `Imposto "${imposto.nome}" atualizado.` }
  }

  if (!args.nome?.trim()) return { erro: 'Nome do imposto é obrigatório.' }
  if (!(Number(args.valor) > 0)) return { erro: 'Valor é obrigatório e precisa ser maior que zero.' }
  const tipo = args.tipo === 'fixo' ? 'fixo' : 'percentual'
  const nome = args.nome.trim()
  const valor = Number(args.valor)

  const { error } = await supabase.from('impostos').insert({ nome, tipo, valor, insumo_id: insumoId ?? null, ativo: true })
  if (error) return { erro: error.message }
  return {
    sucesso: true,
    mensagem: `Imposto "${nome}" criado${insumoNome ? `, vinculado a "${insumoNome}"` : ''}.`,
  }
}

interface GorjetaArgs {
  valor_atual?: number
  tipo?: string
  valor?: number
  ativo?: boolean
}

async function criarGorjeta(supabase: SupabaseClient, args: GorjetaArgs) {
  if (args.valor_atual !== undefined) {
    const { data: tips, error } = await supabase.from('tip_options').select('id, tipo, valor, ativo')
    if (error) return { erro: error.message }
    const tip = (tips ?? []).find((t: { valor: number }) => t.valor === args.valor_atual) as
      | { id: string; tipo: string; valor: number; ativo: boolean }
      | undefined
    if (!tip) {
      return {
        erro: `Nenhuma opção de gorjeta com valor ${args.valor_atual} encontrada.`,
        gorjetas_existentes: (tips ?? []).map((t: { tipo: string; valor: number }) =>
          t.tipo === 'percentual' ? `${t.valor}%` : `CHF ${t.valor}`,
        ),
      }
    }

    const patch: Record<string, unknown> = {}
    if (args.tipo) patch.tipo = args.tipo === 'fixo' ? 'fixo' : 'percentual'
    if (args.valor !== undefined) patch.valor = args.valor
    if (args.ativo !== undefined) patch.ativo = args.ativo
    if (Object.keys(patch).length === 0) return { erro: 'Nada pra alterar.' }

    const { error: updErr } = await supabase.from('tip_options').update(patch).eq('id', tip.id)
    if (updErr) return { erro: updErr.message }
    return { sucesso: true, mensagem: 'Opção de gorjeta atualizada.' }
  }

  if (!(Number(args.valor) > 0)) return { erro: 'Valor é obrigatório e precisa ser maior que zero.' }
  const tipo = args.tipo === 'fixo' ? 'fixo' : 'percentual'
  const valor = Number(args.valor)
  const descricao = tipo === 'percentual' ? `${valor}%` : `CHF ${valor.toFixed(2)}`

  const ordem = await proximaOrdem(supabase, 'tip_options')
  const { error } = await supabase.from('tip_options').insert({ tipo, valor, ativo: true, ordem })
  if (error) return { erro: error.message }
  return { sucesso: true, mensagem: `Opção de gorjeta ${descricao} criada.` }
}

// Linha única do singleton — nunca existe uma segunda (ver estoqueConsumo.ts no painel).
const CONFIG_ESTOQUE_ID = '00000000-0000-0000-0000-000000000001'

/** Liga/desliga a baixa automática de estoque assim que um pedido é
 * confirmado (mesmo switch do painel de Fechamento). */
async function definirFechamentoAutomatico(supabase: SupabaseClient, args: { ativo?: boolean }) {
  if (args.ativo === undefined) return { erro: 'Informe se o fechamento automático deve ficar ligado ou desligado.' }
  const { error } = await supabase
    .from('configuracoes_estoque')
    .update({ fechamento_automatico: args.ativo })
    .eq('id', CONFIG_ESTOQUE_ID)
  if (error) return { erro: error.message }
  return {
    sucesso: true,
    mensagem: `Fechamento automático de estoque ${args.ativo ? 'ligado' : 'desligado'}.`,
  }
}

async function registrarMovimentacaoEstoque(
  supabase: SupabaseClient,
  callerId: string,
  args: { insumo?: string; direcao?: string; quantidade?: number; observacoes?: string },
) {
  if (!args.insumo?.trim()) return { erro: 'Insumo é obrigatório.' }
  if (args.direcao !== 'entrada' && args.direcao !== 'saida') return { erro: 'Direção é obrigatória: "entrada" ou "saida".' }
  if (!(Number(args.quantidade) > 0)) return { erro: 'Quantidade é obrigatória e precisa ser maior que zero.' }

  const { encontrado: insumo, todos, erro } = await buscarPorNome<{ id: string; nome: string; unidade: string }>(
    supabase,
    'insumos',
    'id, nome, unidade',
    args.insumo,
  )
  if (erro) return { erro }
  if (!insumo) return { erro: `Insumo "${args.insumo}" não encontrado.`, insumos_existentes: todos.map((i) => i.nome) }

  const quantidade = Number(args.quantidade)

  const { error: insErr } = await supabase.from('movimentacoes_estoque').insert({
    insumo_id: insumo.id,
    quantidade: args.direcao === 'entrada' ? quantidade : -quantidade,
    tipo: args.direcao === 'entrada' ? 'entrada_manual' : 'saida_manual',
    observacoes: args.observacoes?.trim() || null,
    criado_por: callerId,
  })
  if (insErr) return { erro: insErr.message }
  return {
    sucesso: true,
    mensagem: `Movimentação registrada: ${args.direcao === 'entrada' ? '+' : '-'}${quantidade} ${insumo.unidade} de "${insumo.nome}".`,
  }
}

const MOTIVOS_PERDA_VALIDOS = [
  'desperdicio',
  'perda',
  'produto_danificado',
  'produto_vencido',
  'erro_operacional',
  'falta_de_controle',
  'outros',
]

async function registrarPerda(
  supabase: SupabaseClient,
  callerId: string,
  args: { insumo?: string; quantidade?: number; motivo?: string; observacoes?: string },
) {
  if (!args.insumo?.trim()) return { erro: 'Insumo é obrigatório.' }
  if (!(Number(args.quantidade) > 0)) return { erro: 'Quantidade é obrigatória e precisa ser maior que zero.' }
  if (!args.motivo || !MOTIVOS_PERDA_VALIDOS.includes(args.motivo)) {
    return { erro: `Motivo é obrigatório e precisa ser um de: ${MOTIVOS_PERDA_VALIDOS.join(', ')}.` }
  }

  const { encontrado: insumo, todos, erro } = await buscarPorNome<{ id: string; nome: string; unidade: string }>(
    supabase,
    'insumos',
    'id, nome, unidade',
    args.insumo,
  )
  if (erro) return { erro }
  if (!insumo) return { erro: `Insumo "${args.insumo}" não encontrado.`, insumos_existentes: todos.map((i) => i.nome) }

  const quantidade = Number(args.quantidade)

  const { data: perda, error: perdaErr } = await supabase
    .from('perdas')
    .insert({
      insumo_id: insumo.id,
      quantidade,
      motivo: args.motivo,
      observacoes: args.observacoes?.trim() || null,
      origem_tipo: 'manual',
      criado_por: callerId,
    })
    .select()
    .single()
  if (perdaErr) return { erro: perdaErr.message }

  const { error: movErr } = await supabase.from('movimentacoes_estoque').insert({
    insumo_id: insumo.id,
    quantidade: -quantidade,
    tipo: 'saida_perda',
    origem_tipo: 'perda',
    origem_id: perda.id,
    observacoes: args.observacoes?.trim() || null,
    criado_por: callerId,
  })
  if (movErr) return { erro: movErr.message }

  return { sucesso: true, mensagem: `Perda registrada: -${quantidade} ${insumo.unidade} de "${insumo.nome}".` }
}

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'consultar_vendas',
        description:
          'Consulta pedidos pagos num período: faturamento, gorjetas, ticket médio, produtos mais vendidos, faturamento por forma de pagamento e por categoria do cardápio, quantidade de pedidos por hora do dia (já ordenado da hora mais cheia pra mais fraca), e lucro bruto + margem por produto (receita menos custo dos insumos, pela composição e pelo preço médio pago nas compras já recebidas — é lucro BRUTO, não conta aluguel/taxas/outras despesas fixas; produtos em produtos_sem_custo_cadastrado ficam fora dessa conta porque algum insumo usado nunca foi comprado ou o produto não tem composição cadastrada). Para um dia ou intervalo específico (ex: "domingo passado"), use data_inicio/data_fim em vez de periodo.',
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
          'Consulta o cardápio cadastrado: produtos, categorias, preços, disponibilidade, destaque, descrição, se é um "copo pronto" e seus ingredientes (copo_pronto, ingredientes_copo_pronto), a composição/receita fixa de insumos consumida do estoque em toda venda (composicao — ver definir_composicao_produto), e também os grupos de adicionais/misturas (ex: Frutas, Toppings) com suas opções e preço adicional. Não tem relação com vendas — é o catálogo, vendido ou não.',
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
          'Consulta o estado operacional agora: quantos pedidos estão em cada etapa da cozinha hoje (recebido/em preparo/pronto/entregue), a lista de quem está esperando a equipe confirmar o troco (pedidos_aguardando_dinheiro), e a lista completa de pedidos pagos hoje com nome do cliente, status e valor (pedidos_hoje) — use isso pra perguntas tipo "quem comprou hoje?" ou "quais os nomes dos clientes de hoje?". Informe nome_cliente só quando quiser filtrar por um cliente específico. Só cobre HOJE: para clientes/pedidos de outros dias (ontem, uma data, a semana), use consultar_pedidos_periodo.',
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
        name: 'consultar_pedidos_periodo',
        description:
          'Lista os pedidos pagos de qualquer dia ou período (inclusive dias anteriores), um por um: nome do cliente, data/hora, valor, gorjeta, forma de pagamento, status e itens comprados. Use para perguntas tipo "quem comprou ontem?", "nomes dos clientes do dia 13", "o que o João pediu semana passada?" ou "quando a Maria comprou pela última vez?". Todo pedido fica salvo com o nome do cliente — nunca diga que o histórico de nomes não existe. Para totais (faturamento, mais vendidos) prefira consultar_vendas. Para um dia ou intervalo específico, use data_inicio/data_fim em vez de periodo.',
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
            nome_cliente: {
              type: 'string',
              description: 'Nome (ou parte do nome) de um cliente, para filtrar só os pedidos dele.',
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
        name: 'consultar_fechamento',
        description:
          'Consulta a fila do Fechamento de estoque: quantos pedidos já pagos ainda não tiveram o estoque baixado, agrupados por dia, com o total em CHF de cada dia. Fechar de fato (bater os insumos em lote) é uma ação manual da equipe no painel, fora do seu alcance — isto é só a consulta de quantos/quais pedidos estão esperando.',
        parametersJsonSchema: { type: 'object', properties: {} },
      },
      {
        name: 'consultar_impostos',
        description: 'Consulta os impostos cadastrados: nome, tipo (fixo/percentual), valor, e a qual insumo (se algum) estão vinculados.',
        parametersJsonSchema: { type: 'object', properties: {} },
      },
      {
        name: 'consultar_configuracoes',
        description:
          'Consulta as opções de gorjeta oferecidas no totem, a lista de usuários com acesso ao painel da equipe, e se o fechamento automático de estoque (baixa assim que um pedido é confirmado) está ligado.',
        parametersJsonSchema: { type: 'object', properties: {} },
      },
      {
        name: 'criar_categoria',
        description:
          'Cadastra uma nova categoria de cardápio, OU edita uma já existente — renomeia e/ou reordena (informe nome_atual). Pra reordenar a posição das categorias na barra lateral (ex: "bota Copos Prontos em primeiro"), use o campo `ordem`: menor valor aparece primeiro — veja os valores atuais em consultar_cardapio (categorias, já vem ordenado por ele) antes de escolher o novo número. Não existe "arrastar" — é sempre editando o número de cada categoria.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de uma categoria JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome da categoria: novo nome ao criar, ou nome atualizado ao editar.' },
            ordem: {
              type: 'number',
              description: 'Posição de exibição na barra lateral — menor aparece primeiro. Consulte os valores atuais em consultar_cardapio antes de escolher um novo número.',
            },
          },
        },
      },
      {
        name: 'criar_produto',
        description:
          'Cadastra um novo produto no cardápio, OU edita um já existente (informe nome_atual). Ao editar, só envie os campos que devem mudar. Pra reordenar a posição de exibição de produtos (ex: "bota o X em primeiro", "os copos prontos antes das outras opções"), use o campo `ordem`: menor valor aparece primeiro, dentro da mesma categoria; veja os valores atuais em consultar_cardapio (campo ordem de cada produto, já vem ordenado por ele) antes de decidir o novo número de cada um. Não existe "arrastar" nem reordenação em lote — é sempre editando o número de cada produto.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de um produto JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome do produto (obrigatório ao criar).' },
            categoria: { type: 'string', description: 'Nome de uma categoria já existente (obrigatório ao criar).' },
            preco: { type: 'number', description: 'Preço em CHF (obrigatório ao criar).' },
            disponivel: { type: 'boolean', description: 'Se aparece no totem. Padrão ao criar: true — só pergunte se o usuário mencionar.' },
            destaque: { type: 'boolean', description: 'Se aparece em Destaques. Padrão ao criar: false — só pergunte se o usuário mencionar.' },
            descricao: { type: 'string', description: 'Descrição opcional que aparece no cardápio.' },
            descricao_na_comanda: {
              type: 'boolean',
              description: 'Se true, a descrição vai carimbada na comanda impressa da cozinha em todo pedido. Padrão ao criar: false.',
            },
            max_ingredientes: {
              type: 'number',
              description: 'Limite combinado de quantos adicionais o cliente pode escolher (ex: "só até 4 toppings"). Deixe vazio pra sem limite.',
            },
            ordem: {
              type: 'number',
              description: 'Posição de exibição no cardápio dentro da categoria — menor aparece primeiro. Consulte os valores atuais em consultar_cardapio antes de escolher um novo número.',
            },
          },
        },
      },
      {
        name: 'criar_insumo',
        description:
          'Cadastra um novo insumo de estoque, OU edita um já existente (informe nome_atual) — inclusive pra configurar/alterar o alerta de saldo baixo (estoque_minimo) de um insumo que já existe. Ao editar, só envie os campos que devem mudar.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de um insumo JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome do insumo (obrigatório ao criar).' },
            unidade: { type: 'string', enum: ['kg', 'g', 'l', 'ml', 'unidade'], description: 'Unidade de controle (obrigatório ao criar).' },
            estoque_minimo: { type: 'number', description: 'Alerta de saldo baixo — opcional ao criar; é o campo típico pra editar num insumo existente.' },
            gramas_por_litro: {
              type: 'number',
              description: 'Só pra unidade "l" ou "ml": peso de 1 litro deste insumo em gramas (ex: 1030 pro açaí). Preenchendo isso, a composição dos produtos passa a aceitar a quantidade em gramas em vez de litros/mililitros — o estoque continua controlado na unidade escolhida.',
            },
            ativo: { type: 'boolean', description: 'Se o insumo está ativo. Só ao editar.' },
          },
        },
      },
      {
        name: 'criar_grupo_adicional',
        description:
          'Cadastra um novo grupo de adicionais/misturas (ex: "Frutas", "Toppings"), OU edita um já existente (informe nome_atual).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de um grupo JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome do grupo (obrigatório ao criar).' },
            tipo: {
              type: 'string',
              enum: ['obrigatorio', 'opcional'],
              description: 'Se o cliente é obrigado a escolher algo desse grupo. Padrão ao criar: opcional.',
            },
            selecao: {
              type: 'string',
              enum: ['unica', 'multipla'],
              description: 'Se pode escolher mais de uma opção do grupo. Padrão ao criar: multipla.',
            },
          },
        },
      },
      {
        name: 'criar_opcao_adicional',
        description:
          'Cadastra uma nova opção dentro de um grupo de adicionais já existente (ex: "Banana" dentro de "Frutas"), OU edita uma opção já existente (informe nome_atual).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de uma opção JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome da opção (obrigatório ao criar).' },
            grupo: { type: 'string', description: 'Nome de um grupo de adicionais já existente (obrigatório ao criar).' },
            preco_adicional: { type: 'number', description: 'Quanto soma ao preço do produto. Padrão ao criar: 0.' },
            insumo: { type: 'string', description: 'Nome de um insumo, opcional, se essa opção deve descontar estoque.' },
            quantidade_padrao: { type: 'number', description: 'Quanto do insumo é consumido por escolha — obrigatório só quando "insumo" é informado.' },
            quantidade_maxima: {
              type: 'number',
              description: 'Quantas porções desta opção o cliente pode pedir de uma vez (ex: 3 pra deixar pedir "3x Granola"). Deixe vazio pra só marcar/desmarcar (padrão, 1 porção).',
            },
          },
        },
      },
      {
        name: 'vincular_grupo_adicional',
        description:
          'Vincula (ou desvincula) um grupo de adicionais já existente a um produto já existente — ex: colocar o grupo "Toppings" no produto "Açaí 500ml".',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            produto: { type: 'string', description: 'Nome do produto (obrigatório).' },
            grupo: { type: 'string', description: 'Nome do grupo de adicionais (obrigatório).' },
            acao: { type: 'string', enum: ['vincular', 'desvincular'], description: 'Padrão: vincular.' },
          },
        },
      },
      {
        name: 'definir_ingredientes_copo_pronto',
        description:
          'Marca um produto como "copo pronto" (receita fixa, ex: um açaí já montado) e define a lista de ingredientes que aparece pro cliente no botão "Ver ingredientes" do cardápio — reaproveitando adicionais já cadastrados (ver criar_opcao_adicional), nunca criando um novo. A lista informada em `ingredientes` SUBSTITUI a lista inteira, não soma às existentes — ao editar, sempre peça a lista completa que deve ficar valendo. Use desmarcar=true pra tirar a marcação de copo pronto (some o botão do cardápio).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            produto: { type: 'string', description: 'Nome do produto (obrigatório).' },
            ingredientes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Nomes dos adicionais já cadastrados que compõem o copo pronto — lista completa, substitui a anterior. Obrigatório, a não ser que desmarcar=true.',
            },
            desmarcar: { type: 'boolean', description: 'true pra tirar a marcação de copo pronto do produto (ignora "ingredientes").' },
          },
        },
      },
      {
        name: 'definir_composicao_produto',
        description:
          'Define a composição/receita fixa de insumos de um produto — o que é debitado do estoque em toda venda dele, independente das misturas que o cliente escolher (ex: Açaí 500ml = 400g de açaí + 1 copo). Não é a mesma coisa que adicionais/ingredientes do copo pronto (ver definir_ingredientes_copo_pronto) — aqui são insumos de estoque (ver criar_insumo), com quantidade. A lista em `itens` SUBSTITUI a composição inteira, não soma à existente — ao editar, sempre peça a lista completa que deve ficar valendo.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            produto: { type: 'string', description: 'Nome do produto (obrigatório).' },
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  insumo: { type: 'string', description: 'Nome de um insumo já cadastrado.' },
                  quantidade: {
                    type: 'number',
                    description: 'Quantidade consumida por unidade vendida do produto. Na unidade de controle do insumo, ou em gramas se o insumo tiver densidade cadastrada (ver criar_insumo/gramas_por_litro) — mesmo comportamento da composição no Painel da Equipe.',
                  },
                },
              },
              description: 'Lista completa de insumo + quantidade que compõem a receita — substitui a composição anterior inteira.',
            },
          },
        },
      },
      {
        name: 'criar_fornecedor',
        description:
          'Cadastra um novo fornecedor, OU edita um já existente (informe nome_atual).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de um fornecedor JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome do fornecedor (obrigatório ao criar).' },
            contato: { type: 'string', description: 'Nome da pessoa de contato, opcional.' },
            telefone: { type: 'string', description: 'Telefone, opcional.' },
            email: { type: 'string', description: 'E-mail, opcional.' },
            ativo: { type: 'boolean', description: 'Se o fornecedor está ativo. Só ao editar.' },
          },
        },
      },
      {
        name: 'criar_imposto',
        description:
          'Cadastra um novo imposto, OU edita um já existente (informe nome_atual).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            nome_atual: { type: 'string', description: 'Nome de um imposto JÁ EXISTENTE — informe isso pra EDITAR em vez de criar.' },
            nome: { type: 'string', description: 'Nome do imposto (obrigatório ao criar).' },
            tipo: { type: 'string', enum: ['fixo', 'percentual'], description: 'Como é calculado (obrigatório ao criar).' },
            valor: { type: 'number', description: 'Percentual ou valor fixo em CHF por unidade (obrigatório ao criar).' },
            insumo: { type: 'string', description: 'Nome de um insumo, opcional, se o imposto for vinculado a ele.' },
            ativo: { type: 'boolean', description: 'Se o imposto está ativo. Só ao editar.' },
          },
        },
      },
      {
        name: 'criar_gorjeta',
        description:
          'Cadastra uma nova opção de gorjeta do totem, OU edita uma já existente (informe valor_atual pra identificar qual).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            valor_atual: { type: 'number', description: 'Valor de uma opção de gorjeta JÁ EXISTENTE (o número, sem % nem CHF) — informe isso pra EDITAR em vez de criar.' },
            tipo: { type: 'string', enum: ['fixo', 'percentual'], description: 'Como é calculado (obrigatório ao criar).' },
            valor: { type: 'number', description: 'Percentual ou valor fixo em CHF (obrigatório ao criar).' },
            ativo: { type: 'boolean', description: 'Se aparece no totem. Só ao editar.' },
          },
        },
      },
      {
        name: 'definir_fechamento_automatico',
        description:
          'Liga ou desliga a baixa automática de estoque assim que um pedido é confirmado (mesmo switch do painel de Fechamento) — sem isso ligado, a equipe precisa bater o estoque manualmente.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            ativo: { type: 'boolean', description: 'true liga, false desliga (obrigatório).' },
          },
        },
      },
      {
        name: 'registrar_movimentacao_estoque',
        description:
          'Registra uma entrada ou saída manual de estoque de um insumo (ex: correção de contagem, uso interno).',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            insumo: { type: 'string', description: 'Nome de um insumo já existente (obrigatório).' },
            direcao: { type: 'string', enum: ['entrada', 'saida'], description: 'Se aumenta ou diminui o saldo (obrigatório).' },
            quantidade: { type: 'number', description: 'Quantidade, na unidade do insumo (obrigatório).' },
            observacoes: { type: 'string', description: 'Motivo do lançamento, opcional.' },
          },
        },
      },
      {
        name: 'registrar_perda',
        description:
          'Registra uma perda de estoque avulsa (fora de uma contagem de inventário) — ex: produto estragado ou quebrado.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            insumo: { type: 'string', description: 'Nome de um insumo já existente (obrigatório).' },
            quantidade: { type: 'number', description: 'Quantidade perdida, na unidade do insumo (obrigatório).' },
            motivo: {
              type: 'string',
              enum: ['desperdicio', 'perda', 'produto_danificado', 'produto_vencido', 'erro_operacional', 'falta_de_controle', 'outros'],
              description: 'Motivo da perda (obrigatório).',
            },
            observacoes: { type: 'string', description: 'Detalhes adicionais, opcional.' },
          },
        },
      },
    ],
  },
]

/** Primeira mensagem do usuário na conversa, cortada — usado como rótulo na
 * lista de conversas antigas. */
function previewDaConversa(contents: Content[]): string {
  for (const c of contents) {
    if (c.role !== 'user') continue
    const texto = c.parts?.find((p) => typeof p.text === 'string')?.text
    if (texto) return texto.length > 60 ? `${texto.slice(0, 60)}…` : texto
  }
  return ''
}

/** Grava o histórico atual — chamada depois de qualquer resposta bem-sucedida.
 * Com `conversaId`, atualiza essa conversa; sem ele, cria uma nova (primeira
 * mensagem de uma conversa nova) e devolve o id gerado, pro cliente guardar. */
async function salvarConversa(
  supabase: SupabaseClient,
  usuarioId: string,
  contents: Content[],
  conversaId: string | null,
): Promise<string | null> {
  if (conversaId) {
    await supabase
      .from('assistente_conversas')
      .update({ contents, atualizado_em: new Date().toISOString() })
      .eq('id', conversaId)
      .eq('usuario_id', usuarioId)
    return conversaId
  }
  const { data } = await supabase
    .from('assistente_conversas')
    .insert({ usuario_id: usuarioId, contents })
    .select('id')
    .single()
  return data?.id ?? null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado.' })
    return
  }
  const caller = await requireCaller(req)
  if (!caller) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (req.method === 'GET') {
    // Lista as conversas antigas do usuário (só o resumo, sem o histórico
    // inteiro de cada uma) — usado pelo painel de "conversas antigas".
    if (req.query.list !== undefined) {
      const { data, error } = await supabase
        .from('assistente_conversas')
        .select('id, contents, criado_em, atualizado_em')
        .eq('usuario_id', caller.id)
        .order('atualizado_em', { ascending: false })
        .limit(50)
      if (error) {
        res.status(500).json({ error: error.message })
        return
      }
      const conversas = (data ?? []).map((c) => ({
        id: c.id as string,
        preview: previewDaConversa((c.contents ?? []) as Content[]),
        atualizadoEm: c.atualizado_em as string,
      }))
      res.status(200).json({ conversas })
      return
    }

    // Carrega uma conversa específica (clique numa conversa antiga) ou,
    // sem id, a mais recente (usado quando o widget abre).
    const id = typeof req.query.id === 'string' ? req.query.id : null
    let query = supabase.from('assistente_conversas').select('id, contents').eq('usuario_id', caller.id)
    query = id ? query.eq('id', id) : query.order('atualizado_em', { ascending: false }).limit(1)
    const { data, error } = await query.maybeSingle()
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ conversaId: data?.id ?? null, contents: data?.contents ?? [] })
    return
  }

  // Apaga uma conversa antiga.
  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null
    if (!id) {
      res.status(400).json({ error: 'Id da conversa é obrigatório.' })
      return
    }
    const { error } = await supabase.from('assistente_conversas').delete().eq('id', id).eq('usuario_id', caller.id)
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  const history = Array.isArray(req.body?.contents) ? (req.body.contents as Content[]) : []
  const conversaId = typeof req.body?.conversaId === 'string' ? req.body.conversaId : null
  if (!message) {
    res.status(400).json({ error: 'Mensagem vazia.' })
    return
  }

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
        const idSalvo = await salvarConversa(supabase, caller.id, contents, conversaId)
        res.status(200).json({ reply, contents, conversaId: idSalvo })
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
          else if (call.name === 'consultar_pedidos_periodo') resultado = await consultarPedidosPeriodo(supabase, args)
          else if (call.name === 'consultar_movimentacoes_estoque') resultado = await consultarMovimentacoesEstoque(supabase, args)
          else if (call.name === 'consultar_compras') resultado = await consultarCompras(supabase, args)
          else if (call.name === 'consultar_fornecedores') resultado = await consultarFornecedores(supabase, args)
          else if (call.name === 'consultar_perdas') resultado = await consultarPerdas(supabase, args)
          else if (call.name === 'consultar_inventarios') resultado = await consultarInventarios(supabase)
          else if (call.name === 'consultar_fechamento') resultado = await consultarFechamento(supabase)
          else if (call.name === 'consultar_impostos') resultado = await consultarImpostos(supabase)
          else if (call.name === 'consultar_configuracoes') resultado = await consultarConfiguracoes(supabase)
          else if (call.name === 'criar_categoria') resultado = await criarCategoria(supabase, args)
          else if (call.name === 'criar_produto') resultado = await criarProduto(supabase, args)
          else if (call.name === 'criar_insumo') resultado = await criarInsumo(supabase, args)
          else if (call.name === 'criar_grupo_adicional') resultado = await criarGrupoAdicional(supabase, args)
          else if (call.name === 'criar_opcao_adicional') resultado = await criarOpcaoAdicional(supabase, args)
          else if (call.name === 'vincular_grupo_adicional') resultado = await vincularGrupoAdicional(supabase, args)
          else if (call.name === 'definir_ingredientes_copo_pronto') resultado = await definirIngredientesCopoPronto(supabase, args)
          else if (call.name === 'definir_composicao_produto') resultado = await definirComposicaoProduto(supabase, args)
          else if (call.name === 'definir_fechamento_automatico') resultado = await definirFechamentoAutomatico(supabase, args)
          else if (call.name === 'criar_fornecedor') resultado = await criarFornecedor(supabase, args)
          else if (call.name === 'criar_imposto') resultado = await criarImposto(supabase, args)
          else if (call.name === 'criar_gorjeta') resultado = await criarGorjeta(supabase, args)
          else if (call.name === 'registrar_movimentacao_estoque')
            resultado = await registrarMovimentacaoEstoque(supabase, caller.id, args)
          else if (call.name === 'registrar_perda') resultado = await registrarPerda(supabase, caller.id, args)
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

    const idSalvo = await salvarConversa(supabase, caller.id, contents, conversaId)
    res.status(200).json({
      reply: 'Essa pergunta ficou grande demais pra eu responder agora — tenta ser mais específico?',
      contents,
      conversaId: idSalvo,
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
