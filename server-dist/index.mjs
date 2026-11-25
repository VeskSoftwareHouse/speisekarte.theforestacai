// server/index.ts
import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// api/admin-users.ts
import { createClient as createClient2 } from "@supabase/supabase-js";

// api/_auth.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var anonKey = process.env.VITE_SUPABASE_ANON_KEY;
async function requireCaller(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !supabaseUrl || !anonKey) return null;
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id };
}

// api/admin-users.ts
var supabaseUrl2 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function mapUser(u) {
  return {
    id: u.id,
    email: u.email ?? "",
    nome: typeof u.user_metadata?.nome === "string" ? u.user_metadata.nome : "",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null
  };
}
async function handler(req, res) {
  if (!supabaseUrl2 || !serviceRoleKey) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (SUPABASE_SERVICE_ROLE_KEY ausente)." });
    return;
  }
  const caller = await requireCaller(req);
  if (!caller) {
    res.status(401).json({ error: "N\xE3o autenticado." });
    return;
  }
  const admin = createClient2(supabaseUrl2, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  try {
    if (req.method === "GET") {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      res.status(200).json({ users: data.users.map(mapUser) });
      return;
    }
    if (req.method === "POST") {
      const { email, password, nome } = req.body ?? {};
      if (!email || !password) {
        res.status(400).json({ error: "Email e senha s\xE3o obrigat\xF3rios." });
        return;
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: nome ? { nome } : void 0
      });
      if (error) throw error;
      res.status(201).json({ user: mapUser(data.user) });
      return;
    }
    if (req.method === "PATCH") {
      const id = typeof req.query.id === "string" ? req.query.id : null;
      if (!id) {
        res.status(400).json({ error: "ID do usu\xE1rio \xE9 obrigat\xF3rio." });
        return;
      }
      const { email, password, nome } = req.body ?? {};
      const attrs = {};
      if (email) attrs.email = email;
      if (password) attrs.password = password;
      if (nome !== void 0) attrs.user_metadata = { nome };
      const { data, error } = await admin.auth.admin.updateUserById(id, attrs);
      if (error) throw error;
      res.status(200).json({ user: mapUser(data.user) });
      return;
    }
    if (req.method === "DELETE") {
      const id = typeof req.query.id === "string" ? req.query.id : null;
      if (!id) {
        res.status(400).json({ error: "ID do usu\xE1rio \xE9 obrigat\xF3rio." });
        return;
      }
      if (id === caller.id) {
        res.status(400).json({ error: "Voc\xEA n\xE3o pode excluir seu pr\xF3prio usu\xE1rio." });
        return;
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
      res.status(204).end();
      return;
    }
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Erro inesperado." });
  }
}

// api/assistant-chat.ts
import {
  GoogleGenAI,
  ApiError,
  createUserContent,
  createModelContent,
  createPartFromFunctionCall,
  createPartFromFunctionResponse
} from "@google/genai";
import { createClient as createClient3 } from "@supabase/supabase-js";
var geminiApiKey = process.env.GEMINI_API_KEY;
var supabaseUrl3 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey2 = process.env.SUPABASE_SERVICE_ROLE_KEY;
var MODEL = "gemini-3.6-flash";
var MAX_TOOL_ROUNDS = 5;
function buildSystemInstruction() {
  const hoje = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return `Seu nome \xE9 Tuco (o tucano mascote da marca). Voc\xEA \xE9 a assistente do Painel da Equipe da The Forest A\xE7a\xED, um food truck de a\xE7a\xED na Su\xED\xE7a. Responda sempre em portugu\xEAs, de forma direta e curta \u2014 quem est\xE1 te lendo \xE9 a equipe no meio do expediente, n\xE3o tem tempo pra text\xE3o. S\xF3 mencione seu nome se perguntarem diretamente ("qual seu nome?") \u2014 n\xE3o precisa se apresentar em toda resposta.

Seja caloroso e carism\xE1tico em toda resposta, mesmo as diretas e curtas: trate quem te escreve com simpatia, pode chamar de "chefe" de vez em quando (sem exagerar nem repetir isso toda hora). Isso vale especialmente quando voc\xEA n\xE3o consegue ajudar com algo: nunca responda seco tipo "n\xE3o tenho acesso a esse dado" \u2014 diga com gentileza, tipo "Sinto muito, chefe, essa informa\xE7\xE3o eu n\xE3o tenho como te dar agora" ou algo no mesmo esp\xEDrito, sempre na sua pr\xF3pria voz.

Humor \xE9 parte da sua personalidade, n\xE3o um extra opcional: QUASE TODA resposta deve trazer uma piadinha leve ou um trocadilho, mesmo que pequeno. Aproveite bastante que voc\xEA \xE9 um tucano \u2014 bico, voar, pena, tucano/Tuco, a\xE7a\xED s\xE3o \xF3timos gatilhos de trocadilho, mas vale qualquer humor leve que caiba na frase. N\xE3o espere "vir uma boa" pra soltar algo: capriche mesmo que seja um trocadilho simples. A \xFAnica regra de ouro \xE9 que a piada nunca substitui nem atrapalha a resposta de verdade \u2014 ela \xE9 uma frase extra, curta, antes ou depois do que a pergunta pediu, e a informa\xE7\xE3o em si continua completa e correta. Corte o humor por completo (nem tente) em confirma\xE7\xF5es antes de gravar algo, em erros, e em qualquer situa\xE7\xE3o que pare\xE7a s\xE9ria ou urgente \u2014 a\xED o tom \xE9 direto, sem gracinha. Fora esses casos, humor \xE9 regra, n\xE3o exce\xE7\xE3o.

Hoje \xE9 ${hoje} (AAAA-MM-DD). Quando a pergunta mencionar um dia espec\xEDfico (ex: "domingo passado", "dia 25", "ontem \xE0 noite"), calcule a data exata a partir de hoje e passe em data_inicio/data_fim na ferramenta consultar_vendas (ou consultar_pedidos_periodo, se a pergunta for sobre clientes/pedidos individuais) \u2014 n\xE3o se limite ao par\xE2metro periodo quando o usu\xE1rio pedir um dia espec\xEDfico.

Responda em texto simples, sem markdown: nunca use **negrito**, *it\xE1lico*, listas com "-"/"*" nem t\xEDtulos com "#". Para listar itens (ex: produtos mais vendidos), use uma linha por item com n\xFAmeros normais ("1. A\xE7a\xED 300ml: 67 unidades"), sem nenhum asterisco. Tamb\xE9m n\xE3o use travess\xE3o nem meia-risca ("\u2014"/"\u2013") em nenhuma frase \u2014 troque por v\xEDrgula, ponto final, ou reescreva a frase; use s\xF3 o h\xEDfen normal ("-") quando fizer parte de uma palavra composta.

Voc\xEA s\xF3 sabe o que as ferramentas dispon\xEDveis te contam. Nunca invente n\xFAmeros \u2014 se a pergunta precisar de dado real, chame a ferramenta certa antes de responder. Voc\xEA tem acesso a todo o painel da equipe: vendas/relat\xF3rios, incluindo lucro bruto e margem por produto (consultar_vendas), estado atual dos pedidos de hoje (consultar_pedidos_atuais), pedidos e nomes de clientes de qualquer dia ou per\xEDodo, inclusive dias anteriores (consultar_pedidos_periodo),card\xE1pio e adicionais (consultar_cardapio), saldo de estoque (consultar_estoque), hist\xF3rico de movimenta\xE7\xF5es de estoque (consultar_movimentacoes_estoque), pedidos de compra (consultar_compras), fornecedores (consultar_fornecedores), perdas (consultar_perdas), contagens de invent\xE1rio (consultar_inventarios), fila de pedidos pendentes de fechamento de estoque (consultar_fechamento), impostos (consultar_impostos), e gorjetas/usu\xE1rios da equipe/fechamento autom\xE1tico de estoque (consultar_configuracoes). Voc\xEA \xE9 a especialista em tudo que est\xE1 no painel \u2014 qualquer pergunta sobre o que ele mostra ou faz, tente responder chamando a ferramenta certa antes de dizer que n\xE3o sabe. Se o resultado de uma ferramenta n\xE3o trouxer o dado que a pergunta pediu, isso significa que a informa\xE7\xE3o n\xE3o est\xE1 dispon\xEDvel nessa ferramenta \u2014 nunca conclua "zero" ou "nenhum" por conta pr\xF3pria a partir disso; diga que voc\xEA n\xE3o tem acesso a esse dado espec\xEDfico. Fale sempre na primeira pessoa ("eu n\xE3o tenho", "eu n\xE3o consigo calcular") \u2014 nunca em terceira pessoa como se fosse outra coisa respondendo (nunca "o painel n\xE3o consegue" ou "o sistema n\xE3o tem"): \xE9 voc\xEA quem est\xE1 conversando, n\xE3o o painel. Se a pergunta n\xE3o tiver nada a ver com a opera\xE7\xE3o desta loja, diga que s\xF3 sabe responder sobre isso.

CADASTRO E EDI\xC7\xC3O (criar_categoria, criar_produto, criar_insumo, criar_grupo_adicional, criar_opcao_adicional, vincular_grupo_adicional, definir_ingredientes_copo_pronto, definir_composicao_produto, criar_fornecedor, criar_pedido_compra, criar_imposto, criar_gorjeta, definir_fechamento_automatico, registrar_movimentacao_estoque, registrar_perda): quando o usu\xE1rio pedir pra cadastrar OU editar/alterar/atualizar algo (ex: "configura um alerta de saldo baixo no a\xE7a\xED", "muda o pre\xE7o do X", "desativa o fornecedor Y"), use a ferramenta correspondente \u2014 a maioria serve tanto pra criar quanto pra editar: informando o campo "*_atual" (ex: nome_atual, valor_atual) voc\xEA EDITA o registro existente daquele nome; sem isso, voc\xEA CRIA um novo. Nunca diga que n\xE3o sabe editar algo antes de checar se a ferramenta certa aceita isso. Pra ligar/desligar um grupo de adicionais num produto (ex: "coloca o Toppings no A\xE7a\xED 500ml"), use vincular_grupo_adicional \u2014 n\xE3o \xE9 a mesma coisa que criar o grupo ou a op\xE7\xE3o. Pra marcar um produto como "copo pronto" (o bot\xE3o "Ver ingredientes" no card\xE1pio) e escolher quais adicionais j\xE1 cadastrados aparecem nele, use definir_ingredientes_copo_pronto. Pra definir quais insumos de estoque (e quanto de cada) s\xE3o debitados em toda venda de um produto, use definir_composicao_produto \u2014 n\xE3o confunda com definir_ingredientes_copo_pronto, que \xE9 s\xF3 informativo pro cliente e usa adicionais, n\xE3o insumos. Pra lan\xE7ar um novo pedido de compra a um fornecedor (ex: "faz um pedido pra Distribuidora X com 10kg de banana e 5L de a\xE7a\xED"), use criar_pedido_compra, pedindo fornecedor e a lista de insumo+quantidade (valor unit\xE1rio \xE9 opcional) \u2014 essa ferramenta s\xF3 CRIA pedidos novos, nunca edita um j\xE1 existente, e nunca marca como "recebido" (isso d\xE1 entrada no estoque e s\xF3 se faz manualmente na lista de Compras, ao confirmar a entrega f\xEDsica). Nunca diga que n\xE3o consegue mexer em nada disso.

Voc\xEA tamb\xE9m pode receber uma FOTO junto da mensagem (\xE0s vezes sem nenhum texto junto). Trate a imagem como faria com uma frase digitada, usando as mesmas ferramentas de CADASTRO E EDI\xC7\xC3O: se for uma foto de uma lista escrita \xE0 m\xE3o ou impressa (ex: lista de insumos ou produtos a cadastrar), leia cada item e cadastre um por um com criar_insumo/criar_produto (confirme a unidade de cada insumo se n\xE3o estiver escrita, nunca invente). Se for uma foto de um produto f\xEDsico (ex: um saco ou caixa de um insumo que chegou), identifique de qual insumo cadastrado ela mais parece se tratar e pergunte a quantidade que chegou pra dar entrada no estoque com registrar_movimentacao_estoque \u2014 nunca invente uma quantidade que n\xE3o veio escrita em lugar nenhum (nota, embalagem) nem foi dita pelo usu\xE1rio. Se a imagem estiver ileg\xEDvel, n\xE3o bater com nenhum insumo/produto j\xE1 cadastrado, ou faltar informa\xE7\xE3o obrigat\xF3ria (ex: quantidade, pre\xE7o), pergunte antes de gravar qualquer coisa, do mesmo jeito que faria numa conversa s\xF3 de texto.

Fa\xE7a perguntas UMA DE CADA VEZ, como numa conversa normal \u2014 nunca liste todos os campos de uma vez feito um formul\xE1rio. Ao editar, pe\xE7a s\xF3 os campos que o usu\xE1rio quer mudar (n\xE3o pergunte os que n\xE3o mudam). Ao criar, pe\xE7a s\xF3 o que for obrigat\xF3rio; campos opcionais (dispon\xEDvel, destaque, descri\xE7\xE3o, estoque m\xEDnimo, pre\xE7o adicional...) s\xF3 pergunte se fizer sentido, sen\xE3o use o padr\xE3o da pr\xF3pria ferramenta. Assim que tiver o necess\xE1rio, chame a ferramenta direto \u2014 ela j\xE1 grava, sem passo de confirma\xE7\xE3o nenhum, ent\xE3o nunca pare pra perguntar "posso confirmar?" nem liste um resumo do que vai mudar antes de chamar. Depois que a ferramenta responder com sucesso, avise o usu\xE1rio em uma frase curta o que foi feito. Se a ferramenta devolver "erro" (ex: item n\xE3o encontrado), explique o problema ao usu\xE1rio e pergunte como prosseguir \u2014 n\xE3o insista repetindo a mesma chamada.

Fora do seu alcance (fica pra a equipe fazer direto no painel, sempre por decis\xE3o de seguran\xE7a ou porque exige conferir algo f\xEDsico na hora): gerenciar usu\xE1rios com acesso ao painel (seguran\xE7a de contas), editar um pedido de compra j\xE1 existente ou marc\xE1-lo como "recebido" (o que d\xE1 entrada no estoque, exige conferir a entrega f\xEDsica), registrar contagens de invent\xE1rio, executar o fechamento de estoque em si (bater os insumos em lote), confirmar o pagamento em dinheiro de um pedido (exige contar o troco na m\xE3o) ou por Twint (exige conferir o recebimento no celular do caixa), e mudar o status de um pedido no quadro da cozinha (recebido/em preparo/pronto/entregue) \u2014 mas voc\xEA PODE criar um pedido de compra novo (criar_pedido_compra), consultar a fila de pendentes de fechamento (consultar_fechamento), os pedidos de compra j\xE1 cadastrados (consultar_compras), as contagens j\xE1 feitas (consultar_inventarios), e o estado atual dos pedidos (consultar_pedidos_atuais). Fora isso, praticamente todo cadastro do painel (card\xE1pio, adicionais, copo pronto, composi\xE7\xE3o de estoque, insumos, fornecedores, pedidos de compra, impostos, gorjetas, fechamento autom\xE1tico, movimenta\xE7\xF5es e perdas de estoque) voc\xEA l\xEA E edita \u2014 nunca diga que n\xE3o consegue sem antes checar se existe uma ferramenta pra isso.`;
}
var RETRY_DELAYS_MS = [800, 2e3];
async function generateContentComRetry(client, params) {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await client.models.generateContent(params);
    } catch (err) {
      const transitorio = err instanceof ApiError && (err.status === 503 || err.status === 429);
      if (!transitorio || tentativa >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[tentativa]));
    }
  }
}
function stripMarkdown(text) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^[-*]\s+/gm, "").replace(/\s+[—–]\s+/g, ", ");
}
var PAID_STATUSES = ["recebido", "em_preparo", "pronto", "entregue"];
function parseDataLocal(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function periodoParaIntervalo(args) {
  const agora = /* @__PURE__ */ new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fimAberto = new Date(agora.getTime() + 1e3);
  const inicioEspecifico = args.data_inicio ? parseDataLocal(args.data_inicio) : null;
  if (inicioEspecifico) {
    const fimEspecifico = args.data_fim ? parseDataLocal(args.data_fim) : null;
    const fim = fimEspecifico ? new Date(fimEspecifico.getTime() + 24 * 60 * 60 * 1e3) : new Date(inicioEspecifico.getTime() + 24 * 60 * 60 * 1e3);
    return { inicio: inicioEspecifico, fim };
  }
  const periodo = args.periodo ?? "hoje";
  if (periodo === "ontem") {
    const inicio = new Date(inicioHoje);
    inicio.setDate(inicio.getDate() - 1);
    return { inicio, fim: inicioHoje };
  }
  if (periodo === "semana") {
    const inicio = new Date(inicioHoje);
    inicio.setDate(inicio.getDate() - 7);
    return { inicio, fim: fimAberto };
  }
  if (periodo === "mes") {
    return { inicio: new Date(agora.getFullYear(), agora.getMonth(), 1), fim: fimAberto };
  }
  return { inicio: inicioHoje, fim: fimAberto };
}
function valorComImposto(valorUnitario, insumoId, impostos) {
  const doInsumo = impostos.filter((i) => i.ativo && i.insumo_id === insumoId);
  const percentual = doInsumo.filter((i) => i.tipo === "percentual").reduce((soma, i) => soma + i.valor, 0);
  const fixo = doInsumo.filter((i) => i.tipo === "fixo").reduce((soma, i) => soma + i.valor, 0);
  return valorUnitario * (1 + percentual / 100) + fixo;
}
async function custoMedioPorInsumo(supabase) {
  const [comprasRes, impostosRes] = await Promise.all([
    supabase.from("pedidos_compra").select("pedido_compra_itens(insumo_id, quantidade, valor_unitario)").eq("status", "recebido"),
    supabase.from("impostos").select("tipo, valor, insumo_id, ativo")
  ]);
  const itens = (comprasRes.data ?? []).flatMap(
    (p) => p.pedido_compra_itens ?? []
  );
  const impostos = impostosRes.data ?? [];
  const soma = /* @__PURE__ */ new Map();
  for (const item of itens) {
    if (item.valor_unitario == null || item.quantidade <= 0) continue;
    const custo = valorComImposto(item.valor_unitario, item.insumo_id, impostos);
    const acc = soma.get(item.insumo_id) ?? { valor: 0, quantidade: 0 };
    acc.valor += custo * item.quantidade;
    acc.quantidade += item.quantidade;
    soma.set(item.insumo_id, acc);
  }
  const custos = /* @__PURE__ */ new Map();
  for (const [insumoId, { valor, quantidade }] of soma) custos.set(insumoId, valor / quantidade);
  return custos;
}
async function consultarVendas(supabase, args) {
  const { inicio, fim } = periodoParaIntervalo(args);
  const { data, error } = await supabase.from("orders").select(
    "valor_pago, gorjeta, forma_pagamento, criado_em, order_items(nome_item, quantidade, preco_unitario, menu_item_id, modifiers_selecionados)"
  ).in("status", PAID_STATUSES).gte("criado_em", inicio.toISOString()).lte("criado_em", fim.toISOString());
  if (error) return { error: error.message };
  const pedidos = data ?? [];
  const faturamento = pedidos.reduce((soma, p) => soma + (p.valor_pago ?? 0), 0);
  const gorjetas = pedidos.reduce((soma, p) => soma + (p.gorjeta ?? 0), 0);
  const porProduto = /* @__PURE__ */ new Map();
  const porFormaPagamento = /* @__PURE__ */ new Map();
  const porHora = /* @__PURE__ */ new Map();
  for (const pedido of pedidos) {
    const forma = pedido.forma_pagamento ?? "N\xE3o informado";
    porFormaPagamento.set(forma, (porFormaPagamento.get(forma) ?? 0) + (pedido.valor_pago ?? 0));
    const hora = new Date(pedido.criado_em).getHours();
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
    for (const item of pedido.order_items ?? []) {
      porProduto.set(item.nome_item, (porProduto.get(item.nome_item) ?? 0) + item.quantidade);
    }
  }
  const menuItemIds = [
    ...new Set(pedidos.flatMap((p) => (p.order_items ?? []).map((i) => i.menu_item_id).filter((id) => !!id)))
  ];
  const porCategoria = /* @__PURE__ */ new Map();
  if (menuItemIds.length > 0) {
    const { data: itemsData } = await supabase.from("menu_items").select("id, categoria_id").in("id", menuItemIds);
    const categoriaIds = [...new Set((itemsData ?? []).map((i) => i.categoria_id))];
    const { data: catsData } = await supabase.from("categories").select("id, nome").in("id", categoriaIds);
    const nomeCategoriaPorItemId = /* @__PURE__ */ new Map();
    const nomeCategoriaPorId = new Map((catsData ?? []).map((c) => [c.id, c.nome]));
    for (const item of itemsData ?? []) {
      nomeCategoriaPorItemId.set(item.id, nomeCategoriaPorId.get(item.categoria_id) ?? "Sem categoria");
    }
    for (const pedido of pedidos) {
      for (const item of pedido.order_items ?? []) {
        if (!item.menu_item_id) continue;
        const categoria = nomeCategoriaPorItemId.get(item.menu_item_id) ?? "Sem categoria";
        porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + item.preco_unitario * item.quantidade);
      }
    }
  }
  const optionIds = [
    ...new Set(
      pedidos.flatMap((p) => (p.order_items ?? []).flatMap((i) => (i.modifiers_selecionados ?? []).map((m) => m.option_id)))
    )
  ];
  const [composicaoRes, opcoesRes, custoPorInsumo] = await Promise.all([
    menuItemIds.length > 0 ? supabase.from("menu_item_insumos").select("menu_item_id, insumo_id, quantidade").in("menu_item_id", menuItemIds) : Promise.resolve({ data: [] }),
    optionIds.length > 0 ? supabase.from("modifier_options").select("id, insumo_id, quantidade_padrao").in("id", optionIds) : Promise.resolve({ data: [] }),
    custoMedioPorInsumo(supabase)
  ]);
  const composicaoPorItem = /* @__PURE__ */ new Map();
  for (const row of composicaoRes.data ?? []) {
    const lista = composicaoPorItem.get(row.menu_item_id) ?? [];
    lista.push(row);
    composicaoPorItem.set(row.menu_item_id, lista);
  }
  const opcaoPorId = new Map((opcoesRes.data ?? []).map((o) => [o.id, o]));
  const margemPorProduto = /* @__PURE__ */ new Map();
  let receitaComCustoCompleto = 0;
  let custoConhecido = 0;
  const produtosSemCusto = /* @__PURE__ */ new Set();
  for (const pedido of pedidos) {
    for (const item of pedido.order_items ?? []) {
      const receitaItem = item.preco_unitario * item.quantidade;
      let custoUnitario = 0;
      let completo = true;
      const composicao = item.menu_item_id ? composicaoPorItem.get(item.menu_item_id) : void 0;
      if (!composicao || composicao.length === 0) {
        completo = false;
      } else {
        for (const linha of composicao) {
          const custo = custoPorInsumo.get(linha.insumo_id);
          if (custo == null) {
            completo = false;
            continue;
          }
          custoUnitario += custo * linha.quantidade;
        }
      }
      for (const mod of item.modifiers_selecionados ?? []) {
        const opcao = opcaoPorId.get(mod.option_id);
        if (!opcao?.insumo_id || !opcao.quantidade_padrao) continue;
        const custo = custoPorInsumo.get(opcao.insumo_id);
        if (custo == null) {
          completo = false;
          continue;
        }
        custoUnitario += custo * opcao.quantidade_padrao * (mod.quantidade ?? 1);
      }
      const custoItem = custoUnitario * item.quantidade;
      if (completo) {
        receitaComCustoCompleto += receitaItem;
        custoConhecido += custoItem;
      } else {
        produtosSemCusto.add(item.nome_item);
      }
      const row = margemPorProduto.get(item.nome_item) ?? { receita: 0, custo: 0, completo: true };
      row.receita += receitaItem;
      row.custo += custoItem;
      if (!completo) row.completo = false;
      margemPorProduto.set(item.nome_item, row);
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
    margem_por_produto: [...margemPorProduto.entries()].map(([nome, m]) => ({
      nome,
      receita_chf: Number(m.receita.toFixed(2)),
      custo_chf: Number(m.custo.toFixed(2)),
      margem_chf: Number((m.receita - m.custo).toFixed(2)),
      margem_percentual: m.completo && m.receita > 0 ? Number(((m.receita - m.custo) / m.receita * 100).toFixed(0)) : null,
      custo_completo: m.completo
    })).sort((a, b) => b.receita_chf - a.receita_chf),
    produtos_vendidos: [...porProduto.entries()].map(([nome, quantidade]) => ({ nome, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    faturamento_por_forma_pagamento: [...porFormaPagamento.entries()].map(([forma, chf]) => ({
      forma,
      faturamento_chf: Number(chf.toFixed(2))
    })),
    faturamento_por_categoria: [...porCategoria.entries()].map(([categoria, chf]) => ({ categoria, faturamento_chf: Number(chf.toFixed(2)) })).sort((a, b) => b.faturamento_chf - a.faturamento_chf),
    // Ordenado da hora mais cheia para a mais fraca — o modelo não precisa
    // comparar os 24 valores sozinho pra achar o pico.
    pedidos_por_hora: [...porHora.entries()].map(([hora, pedidos2]) => ({ hora: `${String(hora).padStart(2, "0")}h`, pedidos: pedidos2 })).sort((a, b) => b.pedidos - a.pedidos)
  };
}
async function consultarCardapio(supabase, args) {
  const { data: categorias, error: catErr } = await supabase.from("categories").select("id, nome, ordem").order("ordem");
  if (catErr) return { error: catErr.message };
  let query = supabase.from("menu_items").select("id, nome, descricao, preco, disponivel, destaque, categoria_id, copo_pronto, ordem").order("ordem");
  if (args.apenas_disponiveis) query = query.eq("disponivel", true);
  const { data: itens, error: itensErr } = await query;
  if (itensErr) return { error: itensErr.message };
  const [gruposRes, opcoesRes, ingredientesRes, composicaoRes, insumosRes] = await Promise.all([
    supabase.from("modifiers").select("id, nome, tipo, selecao").order("nome"),
    supabase.from("modifier_options").select("id, modifier_id, nome, preco_adicional, quantidade_maxima").order("ordem"),
    supabase.from("menu_item_ingredientes").select("menu_item_id, modifier_option_id").order("ordem"),
    supabase.from("menu_item_insumos").select("menu_item_id, insumo_id, quantidade"),
    supabase.from("insumos").select("id, nome, unidade, gramas_por_litro")
  ]);
  if (gruposRes.error) return { error: gruposRes.error.message };
  if (opcoesRes.error) return { error: opcoesRes.error.message };
  if (ingredientesRes.error) return { error: ingredientesRes.error.message };
  if (composicaoRes.error) return { error: composicaoRes.error.message };
  if (insumosRes.error) return { error: insumosRes.error.message };
  const nomeOpcaoPorId = new Map((opcoesRes.data ?? []).map((o) => [o.id, o.nome]));
  const ingredientesPorItem = /* @__PURE__ */ new Map();
  for (const link of ingredientesRes.data ?? []) {
    const nomeOpcao = nomeOpcaoPorId.get(link.modifier_option_id);
    if (!nomeOpcao) continue;
    const lista = ingredientesPorItem.get(link.menu_item_id) ?? [];
    lista.push(nomeOpcao);
    ingredientesPorItem.set(link.menu_item_id, lista);
  }
  const insumoPorId = new Map(
    (insumosRes.data ?? []).map((i) => [i.id, i])
  );
  const composicaoPorItem = /* @__PURE__ */ new Map();
  for (const linha of composicaoRes.data ?? []) {
    const insumo = insumoPorId.get(linha.insumo_id);
    if (!insumo) continue;
    const emGramas = (insumo.unidade === "l" || insumo.unidade === "ml") && insumo.gramas_por_litro;
    const litros = insumo.unidade === "ml" ? linha.quantidade / 1e3 : linha.quantidade;
    const quantidade = emGramas ? litros * insumo.gramas_por_litro : linha.quantidade;
    const lista = composicaoPorItem.get(linha.menu_item_id) ?? [];
    lista.push({ insumo: insumo.nome, quantidade: Number(quantidade.toFixed(2)), unidade: emGramas ? "g" : insumo.unidade });
    composicaoPorItem.set(linha.menu_item_id, lista);
  }
  const nomeCategoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  let produtos = (itens ?? []).map(
    (i) => ({
      nome: i.nome,
      descricao: i.descricao,
      categoria: nomeCategoriaPorId.get(i.categoria_id) ?? "Sem categoria",
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
      composicao: composicaoPorItem.get(i.id) ?? []
    })
  );
  if (args.categoria) {
    const termo = args.categoria.toLowerCase();
    produtos = produtos.filter((p) => p.categoria.toLowerCase().includes(termo));
  }
  const opcoesPorGrupo = /* @__PURE__ */ new Map();
  for (const o of opcoesRes.data ?? []) {
    const lista = opcoesPorGrupo.get(o.modifier_id) ?? [];
    lista.push({ nome: o.nome, preco_adicional_chf: o.preco_adicional, quantidade_maxima: o.quantidade_maxima ?? 1 });
    opcoesPorGrupo.set(o.modifier_id, lista);
  }
  const gruposAdicionais = (gruposRes.data ?? []).map(
    (g) => ({
      grupo: g.nome,
      obrigatorio: g.tipo === "obrigatorio",
      selecao_multipla: g.selecao === "multipla",
      opcoes: opcoesPorGrupo.get(g.id) ?? []
    })
  );
  return {
    total_produtos: produtos.length,
    total_disponiveis: produtos.filter((p) => p.disponivel).length,
    // Já vem ordenado por `ordem` (menor primeiro) — pra reordenar categorias
    // use criar_categoria com o campo ordem (ver consultar_cardapio/ordem de cada uma).
    categorias: (categorias ?? []).map((c) => ({ nome: c.nome, ordem: c.ordem })),
    produtos,
    total_adicionais: gruposAdicionais.reduce((soma, g) => soma + g.opcoes.length, 0),
    grupos_adicionais: gruposAdicionais
  };
}
async function consultarPedidosAtuais(supabase, args) {
  const inicioHoje = /* @__PURE__ */ new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const [hojeRes, dinheiroRes, twintRes] = await Promise.all([
    supabase.from("orders").select("status, nome_cliente, valor_pago, criado_em").in("status", PAID_STATUSES).gte("criado_em", inicioHoje.toISOString()),
    supabase.from("orders").select("status, nome_cliente, valor_pago, criado_em").eq("status", "aguardando_dinheiro"),
    supabase.from("orders").select("status, nome_cliente, valor_pago, criado_em").eq("status", "aguardando_twint")
  ]);
  if (hojeRes.error) return { error: hojeRes.error.message };
  if (dinheiroRes.error) return { error: dinheiroRes.error.message };
  if (twintRes.error) return { error: twintRes.error.message };
  const hoje = hojeRes.data ?? [];
  const contagemPorStatus = {};
  for (const p of hoje) contagemPorStatus[p.status] = (contagemPorStatus[p.status] ?? 0) + 1;
  const dinheiro = dinheiroRes.data ?? [];
  const twint = twintRes.data ?? [];
  const resultado = {
    pedidos_hoje_por_status: contagemPorStatus,
    aguardando_confirmacao_dinheiro: dinheiro.length,
    aguardando_confirmacao_twint: twint.length,
    // Lista de quem está esperando a equipe conferir o troco no caixa — a
    // confirmação em si (contar o dinheiro na mão) não é algo que você faz.
    pedidos_aguardando_dinheiro: dinheiro.map((p) => ({ nome_cliente: p.nome_cliente, valor_chf: p.valor_pago, criado_em: p.criado_em })),
    // Idem, para quem pagou por Twint e ainda não teve o recebimento conferido.
    pedidos_aguardando_twint: twint.map((p) => ({ nome_cliente: p.nome_cliente, valor_chf: p.valor_pago, criado_em: p.criado_em })),
    // Lista completa de hoje, com nome do cliente — pra perguntas tipo "quem
    // comprou hoje?" sem precisar já saber um nome pra filtrar.
    pedidos_hoje: hoje.map((p) => ({ nome_cliente: p.nome_cliente, status: p.status, valor_chf: p.valor_pago, criado_em: p.criado_em })).sort((a, b) => a.criado_em < b.criado_em ? 1 : -1)
  };
  if (args.nome_cliente) {
    const termo = args.nome_cliente.toLowerCase();
    const todos = [...hoje, ...dinheiro, ...twint];
    resultado.pedidos_encontrados = todos.filter((p) => p.nome_cliente?.toLowerCase().includes(termo)).map((p) => ({ nome_cliente: p.nome_cliente, status: p.status, valor_chf: p.valor_pago, criado_em: p.criado_em }));
  }
  return resultado;
}
var MAX_PEDIDOS_PERIODO = 300;
async function consultarPedidosPeriodo(supabase, args) {
  const { inicio, fim } = periodoParaIntervalo(args);
  let query = supabase.from("orders").select("nome_cliente, status, valor_pago, gorjeta, forma_pagamento, criado_em, order_items(nome_item, quantidade)").in("status", PAID_STATUSES).gte("criado_em", inicio.toISOString()).lt("criado_em", fim.toISOString()).order("criado_em", { ascending: false }).limit(MAX_PEDIDOS_PERIODO + 1);
  if (args.nome_cliente) query = query.ilike("nome_cliente", `%${args.nome_cliente}%`);
  const { data, error } = await query;
  if (error) return { error: error.message };
  const linhas = data ?? [];
  const pedidos = linhas.slice(0, MAX_PEDIDOS_PERIODO).map((p) => ({
    nome_cliente: p.nome_cliente,
    criado_em: p.criado_em,
    status: p.status,
    valor_chf: p.valor_pago,
    gorjeta_chf: p.gorjeta,
    forma_pagamento: p.forma_pagamento,
    itens: (p.order_items ?? []).map((i) => `${i.quantidade}x ${i.nome_item}`)
  }));
  return {
    intervalo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    total_pedidos: pedidos.length,
    ...linhas.length > MAX_PEDIDOS_PERIODO ? { aviso: `Mostrando s\xF3 os ${MAX_PEDIDOS_PERIODO} pedidos mais recentes do per\xEDodo \u2014 pe\xE7a um intervalo menor pra ver o resto.` } : {},
    pedidos
  };
}
async function consultarEstoque(supabase, args) {
  const [insumosRes, saldosRes] = await Promise.all([
    supabase.from("insumos").select("id, nome, unidade, estoque_minimo, estoque_maximo, valor_unitario_padrao, gramas_por_litro").eq("ativo", true),
    supabase.from("insumo_saldos").select("insumo_id, saldo_atual")
  ]);
  if (insumosRes.error) return { error: insumosRes.error.message };
  if (saldosRes.error) return { error: saldosRes.error.message };
  const saldoPorId = new Map(
    (saldosRes.data ?? []).map((s) => [s.insumo_id, s.saldo_atual])
  );
  let insumos = insumosRes.data ?? [];
  if (args.insumo) {
    const termo = args.insumo.toLowerCase();
    insumos = insumos.filter((i) => i.nome.toLowerCase().includes(termo));
  }
  return {
    insumos: insumos.map((i) => {
      const saldo = saldoPorId.get(i.id) ?? 0;
      return {
        nome: i.nome,
        saldo,
        unidade: i.unidade,
        estoque_minimo: i.estoque_minimo,
        estoque_maximo: i.estoque_maximo,
        valor_unitario_padrao: i.valor_unitario_padrao,
        saldo_baixo: i.estoque_minimo != null && saldo < i.estoque_minimo,
        // Só relevante pra unidade l/ml: peso de 1 litro em gramas, usado pra
        // compor a receita do produto em gramas (ver criar_insumo).
        gramas_por_litro: i.gramas_por_litro
      };
    })
  };
}
async function consultarMovimentacoesEstoque(supabase, args) {
  const { inicio, fim } = periodoParaIntervalo(args);
  const { data, error } = await supabase.from("movimentacoes_estoque").select("insumo_id, quantidade, tipo, criado_em").gte("criado_em", inicio.toISOString()).lte("criado_em", fim.toISOString()).order("criado_em", { ascending: false });
  if (error) return { error: error.message };
  let movimentos = data ?? [];
  const insumoIds = [...new Set(movimentos.map((m) => m.insumo_id))];
  const { data: insumosData } = insumoIds.length ? await supabase.from("insumos").select("id, nome, unidade").in("id", insumoIds) : { data: [] };
  const insumoPorId = new Map((insumosData ?? []).map((i) => [i.id, i]));
  if (args.insumo) {
    const termo = args.insumo.toLowerCase();
    movimentos = movimentos.filter((m) => insumoPorId.get(m.insumo_id)?.nome.toLowerCase().includes(termo));
  }
  const porTipo = /* @__PURE__ */ new Map();
  for (const m of movimentos) porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + 1);
  return {
    periodo_consultado: `${inicio.toISOString().slice(0, 10)} a ${new Date(fim.getTime() - 1).toISOString().slice(0, 10)}`,
    total_movimentacoes: movimentos.length,
    por_tipo: [...porTipo.entries()].map(([tipo, quantidade]) => ({ tipo, quantidade })),
    movimentacoes_recentes: movimentos.slice(0, 20).map((m) => {
      const insumo = insumoPorId.get(m.insumo_id);
      return {
        insumo: insumo?.nome ?? "Insumo removido",
        quantidade: m.quantidade,
        unidade: insumo?.unidade,
        tipo: m.tipo,
        data: m.criado_em
      };
    })
  };
}
async function consultarCompras(supabase, args) {
  let query = supabase.from("pedidos_compra").select("status, fornecedor_id, criado_em, pedido_compra_itens(quantidade, valor_unitario)").order("criado_em", { ascending: false }).limit(30);
  if (args.status) query = query.eq("status", args.status);
  const { data, error } = await query;
  if (error) return { error: error.message };
  const pedidos = data ?? [];
  const fornecedorIds = [...new Set(pedidos.map((p) => p.fornecedor_id))];
  const { data: fornecedoresData } = fornecedorIds.length ? await supabase.from("fornecedores").select("id, nome").in("id", fornecedorIds) : { data: [] };
  const nomeFornecedorPorId = new Map((fornecedoresData ?? []).map((f) => [f.id, f.nome]));
  const porStatus = /* @__PURE__ */ new Map();
  for (const p of pedidos) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1);
  return {
    total_pedidos: pedidos.length,
    por_status: [...porStatus.entries()].map(([status, quantidade]) => ({ status, quantidade })),
    pedidos: pedidos.map((p) => ({
      fornecedor: nomeFornecedorPorId.get(p.fornecedor_id) ?? "Fornecedor removido",
      status: p.status,
      total_chf: Number(
        (p.pedido_compra_itens ?? []).reduce((soma, it) => soma + (it.valor_unitario ?? 0) * it.quantidade, 0).toFixed(2)
      ),
      criado_em: p.criado_em
    }))
  };
}
async function consultarFornecedores(supabase, args) {
  let query = supabase.from("fornecedores").select("nome, contato, telefone, email, ativo").order("nome");
  if (args.apenas_ativos) query = query.eq("ativo", true);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return { total: (data ?? []).length, fornecedores: data ?? [] };
}
async function consultarPerdas(supabase, args) {
  const { inicio, fim } = periodoParaIntervalo(args);
  const { data, error } = await supabase.from("perdas").select("insumo_id, quantidade, motivo, origem_tipo, criado_em").gte("criado_em", inicio.toISOString()).lte("criado_em", fim.toISOString());
  if (error) return { error: error.message };
  const perdas = data ?? [];
  const insumoIds = [...new Set(perdas.map((p) => p.insumo_id))];
  const { data: insumosData } = insumoIds.length ? await supabase.from("insumos").select("id, nome, unidade").in("id", insumoIds) : { data: [] };
  const insumoPorId = new Map((insumosData ?? []).map((i) => [i.id, i]));
  const porMotivo = /* @__PURE__ */ new Map();
  for (const p of perdas) porMotivo.set(p.motivo, (porMotivo.get(p.motivo) ?? 0) + 1);
  return {
    periodo_consultado: `${inicio.toISOString().slice(0, 10)} a ${new Date(fim.getTime() - 1).toISOString().slice(0, 10)}`,
    total_perdas: perdas.length,
    por_motivo: [...porMotivo.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })),
    perdas: perdas.map((p) => {
      const insumo = insumoPorId.get(p.insumo_id);
      return {
        insumo: insumo?.nome ?? "Insumo removido",
        quantidade: p.quantidade,
        unidade: insumo?.unidade,
        motivo: p.motivo,
        origem: p.origem_tipo,
        data: p.criado_em
      };
    })
  };
}
async function consultarInventarios(supabase) {
  const { data, error } = await supabase.from("inventarios").select("observacoes, criado_em, finalizado_em, inventario_itens(saldo_sistema, saldo_contado)").order("criado_em", { ascending: false }).limit(10);
  if (error) return { error: error.message };
  const inventarios = data ?? [];
  return {
    total_contagens: inventarios.length,
    contagens: inventarios.map((inv) => ({
      data: inv.criado_em,
      finalizada: !!inv.finalizado_em,
      insumos_contados: (inv.inventario_itens ?? []).length,
      divergencias: (inv.inventario_itens ?? []).filter((it) => it.saldo_contado !== it.saldo_sistema).length,
      observacoes: inv.observacoes
    }))
  };
}
async function consultarFechamento(supabase) {
  const { data, error } = await supabase.from("orders").select("criado_em, valor_pago, gorjeta, forma_pagamento").not("status", "in", "(aguardando_pagamento,aguardando_dinheiro,aguardando_twint,cancelado)").eq("estoque_baixado", false).order("criado_em", { ascending: false });
  if (error) return { error: error.message };
  const pedidos = data ?? [];
  const porDia = /* @__PURE__ */ new Map();
  for (const p of pedidos) {
    const dia = p.criado_em.slice(0, 10);
    const acc = porDia.get(dia) ?? { pedidos: 0, total_chf: 0 };
    acc.pedidos += 1;
    acc.total_chf += p.valor_pago ?? 0;
    porDia.set(dia, acc);
  }
  return {
    total_pedidos_pendentes: pedidos.length,
    total_chf_pendente: Number(pedidos.reduce((soma, p) => soma + (p.valor_pago ?? 0), 0).toFixed(2)),
    por_dia: [...porDia.entries()].map(([data2, v]) => ({ data: data2, pedidos: v.pedidos, total_chf: Number(v.total_chf.toFixed(2)) })).sort((a, b) => a.data < b.data ? 1 : -1)
  };
}
async function consultarImpostos(supabase) {
  const { data, error } = await supabase.from("impostos").select("nome, tipo, valor, insumo_id, ativo").order("nome");
  if (error) return { error: error.message };
  const impostos = data ?? [];
  const insumoIds = [...new Set(impostos.map((i) => i.insumo_id).filter((id) => !!id))];
  const { data: insumosData } = insumoIds.length ? await supabase.from("insumos").select("id, nome").in("id", insumoIds) : { data: [] };
  const nomeInsumoPorId = new Map((insumosData ?? []).map((i) => [i.id, i.nome]));
  return {
    total: impostos.length,
    impostos: impostos.map((i) => ({
      nome: i.nome,
      tipo: i.tipo,
      valor: i.valor,
      insumo_vinculado: i.insumo_id ? nomeInsumoPorId.get(i.insumo_id) ?? "Insumo removido" : null,
      ativo: i.ativo
    }))
  };
}
async function consultarConfiguracoes(supabase) {
  const [tipsRes, usersRes, estoqueRes] = await Promise.all([
    supabase.from("tip_options").select("tipo, valor, ativo").order("ordem"),
    supabase.auth.admin.listUsers(),
    supabase.from("configuracoes_estoque").select("fechamento_automatico").maybeSingle()
  ]);
  if (tipsRes.error) return { error: tipsRes.error.message };
  return {
    gorjetas: (tipsRes.data ?? []).map((t) => ({
      tipo: t.tipo,
      valor: t.valor,
      ativo: t.ativo
    })),
    total_usuarios_da_equipe: usersRes.data?.users?.length ?? null,
    usuarios_da_equipe: (usersRes.data?.users ?? []).map((u) => ({
      nome: u.user_metadata?.nome ?? null,
      email: u.email
    })),
    fechamento_automatico_de_estoque: estoqueRes.data?.fechamento_automatico ?? false
  };
}
async function proximaOrdem(supabase, tabela, filtro) {
  let query = supabase.from(tabela).select("ordem").order("ordem", { ascending: false }).limit(1);
  if (filtro) query = query.eq(filtro[0], filtro[1]);
  const { data } = await query;
  const maior = (data ?? [])[0];
  return (maior?.ordem ?? -1) + 1;
}
async function buscarPorNome(supabase, tabela, colunas, nome) {
  const { data, error } = await supabase.from(tabela).select(colunas);
  if (error) return { todos: [], erro: error.message };
  const termo = nome.trim().toLowerCase();
  const todos = data ?? [];
  const exato = todos.find((r) => r.nome.toLowerCase() === termo);
  const encontrado = exato ?? todos.find((r) => r.nome.toLowerCase().includes(termo));
  return { encontrado, todos };
}
async function criarCategoria(supabase, args) {
  if (args.nome_atual?.trim()) {
    const { encontrado: categoria, todos, erro } = await buscarPorNome(
      supabase,
      "categories",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!categoria) {
      return { erro: `Categoria "${args.nome_atual}" n\xE3o encontrada.`, categorias_existentes: todos.map((c) => c.nome) };
    }
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (args.ordem !== void 0) patch.ordem = args.ordem;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar \u2014 informe o novo nome e/ou a nova ordem." };
    const { error: error2 } = await supabase.from("categories").update(patch).eq("id", categoria.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Categoria "${categoria.nome}" atualizada.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome da categoria \xE9 obrigat\xF3rio." };
  const nome = args.nome.trim();
  const ordem = args.ordem ?? await proximaOrdem(supabase, "categories");
  const { error } = await supabase.from("categories").insert({ nome, ordem });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Categoria "${nome}" criada.` };
}
async function criarProduto(supabase, args) {
  let categoriaId;
  let categoriaNome;
  if (args.categoria?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome(
      supabase,
      "categories",
      "id, nome",
      args.categoria
    );
    if (erro) return { erro };
    if (!encontrado) {
      return { erro: `Categoria "${args.categoria}" n\xE3o encontrada.`, categorias_existentes: todos.map((c) => c.nome) };
    }
    categoriaId = encontrado.id;
    categoriaNome = encontrado.nome;
  }
  if (args.nome_atual?.trim()) {
    const { encontrado: produto, todos, erro } = await buscarPorNome(
      supabase,
      "menu_items",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!produto) return { erro: `Produto "${args.nome_atual}" n\xE3o encontrado.`, produtos_existentes: todos.map((p) => p.nome) };
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (categoriaId) patch.categoria_id = categoriaId;
    if (args.preco != null) patch.preco = Number(args.preco);
    if (args.disponivel !== void 0) patch.disponivel = args.disponivel;
    if (args.destaque !== void 0) patch.destaque = args.destaque;
    if (args.descricao !== void 0) patch.descricao = args.descricao.trim() || null;
    if (args.descricao_na_comanda !== void 0) patch.descricao_na_comanda = args.descricao_na_comanda;
    if (args.max_ingredientes !== void 0) patch.max_ingredientes = args.max_ingredientes;
    if (args.ordem !== void 0) patch.ordem = args.ordem;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar \u2014 informe pelo menos um campo novo." };
    const { error: error2 } = await supabase.from("menu_items").update(patch).eq("id", produto.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Produto "${produto.nome}" atualizado.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome do produto \xE9 obrigat\xF3rio." };
  if (!categoriaId || !categoriaNome) return { erro: "Categoria \xE9 obrigat\xF3ria." };
  if (!(Number(args.preco) > 0)) return { erro: "Pre\xE7o \xE9 obrigat\xF3rio e precisa ser maior que zero." };
  const nome = args.nome.trim();
  const disponivel = args.disponivel ?? true;
  const destaque = args.destaque ?? false;
  const preco = Number(args.preco);
  const ordem = args.ordem ?? await proximaOrdem(supabase, "menu_items");
  const { error } = await supabase.from("menu_items").insert({
    nome,
    categoria_id: categoriaId,
    preco,
    disponivel,
    destaque,
    descricao: args.descricao?.trim() || null,
    descricao_na_comanda: args.descricao_na_comanda ?? false,
    max_ingredientes: args.max_ingredientes ?? null,
    ordem
  });
  if (error) return { erro: error.message };
  return {
    sucesso: true,
    mensagem: `Produto "${nome}" criado. As tradu\xE7\xF5es pra outros idiomas ainda n\xE3o foram geradas \u2014 abra o produto no Card\xE1pio e salve pra ger\xE1-las.`
  };
}
var UNIDADES_VALIDAS = ["kg", "g", "l", "ml", "unidade"];
async function criarInsumo(supabase, args) {
  if (args.unidade && !UNIDADES_VALIDAS.includes(args.unidade)) {
    return { erro: `Unidade precisa ser uma de: ${UNIDADES_VALIDAS.join(", ")}.` };
  }
  if (args.nome_atual?.trim()) {
    const { encontrado: insumo, todos, erro } = await buscarPorNome(
      supabase,
      "insumos",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!insumo) return { erro: `Insumo "${args.nome_atual}" n\xE3o encontrado.`, insumos_existentes: todos.map((i) => i.nome) };
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (args.unidade) patch.unidade = args.unidade;
    if (args.estoque_minimo !== void 0) patch.estoque_minimo = args.estoque_minimo;
    if (args.estoque_maximo !== void 0) patch.estoque_maximo = args.estoque_maximo;
    if (args.valor_unitario_padrao !== void 0) patch.valor_unitario_padrao = args.valor_unitario_padrao;
    if (args.gramas_por_litro !== void 0) patch.gramas_por_litro = args.gramas_por_litro;
    if (args.ordem !== void 0) patch.ordem = args.ordem;
    if (args.ativo !== void 0) patch.ativo = args.ativo;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar \u2014 informe pelo menos um campo novo." };
    const { error: error2 } = await supabase.from("insumos").update(patch).eq("id", insumo.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Insumo "${insumo.nome}" atualizado.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome do insumo \xE9 obrigat\xF3rio." };
  if (!args.unidade) return { erro: `Unidade \xE9 obrigat\xF3ria e precisa ser uma de: ${UNIDADES_VALIDAS.join(", ")}.` };
  const nome = args.nome.trim();
  const ordem = args.ordem ?? await proximaOrdem(supabase, "insumos");
  const { error } = await supabase.from("insumos").insert({
    nome,
    unidade: args.unidade,
    estoque_minimo: args.estoque_minimo ?? null,
    estoque_maximo: args.estoque_maximo ?? null,
    valor_unitario_padrao: args.valor_unitario_padrao ?? null,
    gramas_por_litro: args.unidade === "l" || args.unidade === "ml" ? args.gramas_por_litro ?? null : null,
    ativo: true,
    ordem
  });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Insumo "${nome}" criado.` };
}
async function criarGrupoAdicional(supabase, args) {
  if (args.nome_atual?.trim()) {
    const { encontrado: grupo, todos, erro } = await buscarPorNome(
      supabase,
      "modifiers",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!grupo) return { erro: `Grupo "${args.nome_atual}" n\xE3o encontrado.`, grupos_existentes: todos.map((g) => g.nome) };
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (args.tipo) patch.tipo = args.tipo === "obrigatorio" ? "obrigatorio" : "opcional";
    if (args.selecao) patch.selecao = args.selecao === "unica" ? "unica" : "multipla";
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar." };
    const { error: error2 } = await supabase.from("modifiers").update(patch).eq("id", grupo.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Grupo "${grupo.nome}" atualizado.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome do grupo de adicionais \xE9 obrigat\xF3rio." };
  const tipo = args.tipo === "obrigatorio" ? "obrigatorio" : "opcional";
  const selecao = args.selecao === "unica" ? "unica" : "multipla";
  const nome = args.nome.trim();
  const { error } = await supabase.from("modifiers").insert({ nome, tipo, selecao });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Grupo de adicionais "${nome}" criado.` };
}
async function criarOpcaoAdicional(supabase, args) {
  let grupoId;
  let grupoNome;
  if (args.grupo?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome(
      supabase,
      "modifiers",
      "id, nome",
      args.grupo
    );
    if (erro) return { erro };
    if (!encontrado) {
      return { erro: `Grupo de adicionais "${args.grupo}" n\xE3o encontrado.`, grupos_existentes: todos.map((g) => g.nome) };
    }
    grupoId = encontrado.id;
    grupoNome = encontrado.nome;
  }
  let insumoId;
  if (args.insumo?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome(supabase, "insumos", "id, nome", args.insumo);
    if (erro) return { erro };
    if (!encontrado) return { erro: `Insumo "${args.insumo}" n\xE3o encontrado.`, insumos_existentes: todos.map((i) => i.nome) };
    insumoId = encontrado.id;
  }
  if (args.nome_atual?.trim()) {
    const { encontrado: opcao, todos, erro } = await buscarPorNome(
      supabase,
      "modifier_options",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!opcao) return { erro: `Op\xE7\xE3o "${args.nome_atual}" n\xE3o encontrada.`, opcoes_existentes: todos.map((o) => o.nome) };
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (grupoId) patch.modifier_id = grupoId;
    if (args.preco_adicional !== void 0) patch.preco_adicional = args.preco_adicional;
    if (insumoId !== void 0) patch.insumo_id = insumoId;
    if (args.quantidade_padrao !== void 0) patch.quantidade_padrao = args.quantidade_padrao;
    if (args.quantidade_maxima !== void 0) patch.quantidade_maxima = args.quantidade_maxima;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar." };
    const { error: error2 } = await supabase.from("modifier_options").update(patch).eq("id", opcao.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Op\xE7\xE3o "${opcao.nome}" atualizada.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome da op\xE7\xE3o \xE9 obrigat\xF3rio." };
  if (!grupoId || !grupoNome) return { erro: 'Grupo de adicionais \xE9 obrigat\xF3rio (ex: "Frutas", "Toppings").' };
  const nome = args.nome.trim();
  const precoAdicional = args.preco_adicional ?? 0;
  if (insumoId && !(Number(args.quantidade_padrao) > 0)) {
    return { erro: "Quando vincula um insumo, a quantidade padr\xE3o consumida \xE9 obrigat\xF3ria e precisa ser maior que zero." };
  }
  const ordem = await proximaOrdem(supabase, "modifier_options", ["modifier_id", grupoId]);
  const { error } = await supabase.from("modifier_options").insert({
    nome,
    modifier_id: grupoId,
    preco_adicional: precoAdicional,
    ordem,
    insumo_id: insumoId ?? null,
    quantidade_padrao: insumoId ? Number(args.quantidade_padrao) : null,
    quantidade_maxima: args.quantidade_maxima ?? null
  });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Op\xE7\xE3o "${nome}" criada no grupo "${grupoNome}".` };
}
async function vincularGrupoAdicional(supabase, args) {
  if (!args.produto?.trim()) return { erro: "Nome do produto \xE9 obrigat\xF3rio." };
  if (!args.grupo?.trim()) return { erro: "Nome do grupo de adicionais \xE9 obrigat\xF3rio." };
  const desvincular = args.acao === "desvincular";
  const { encontrado: produto, todos: produtos, erro: erroProduto } = await buscarPorNome(
    supabase,
    "menu_items",
    "id, nome",
    args.produto
  );
  if (erroProduto) return { erro: erroProduto };
  if (!produto) return { erro: `Produto "${args.produto}" n\xE3o encontrado.`, produtos_existentes: produtos.map((p) => p.nome) };
  const { encontrado: grupo, todos: grupos, erro: erroGrupo } = await buscarPorNome(
    supabase,
    "modifiers",
    "id, nome",
    args.grupo
  );
  if (erroGrupo) return { erro: erroGrupo };
  if (!grupo) return { erro: `Grupo de adicionais "${args.grupo}" n\xE3o encontrado.`, grupos_existentes: grupos.map((g) => g.nome) };
  const { data: linkExistente } = await supabase.from("menu_item_modifiers").select("menu_item_id").eq("menu_item_id", produto.id).eq("modifier_id", grupo.id).maybeSingle();
  if (desvincular) {
    if (!linkExistente) return { erro: `O grupo "${grupo.nome}" j\xE1 n\xE3o est\xE1 vinculado ao produto "${produto.nome}".` };
    const { error: error2 } = await supabase.from("menu_item_modifiers").delete().eq("menu_item_id", produto.id).eq("modifier_id", grupo.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Grupo "${grupo.nome}" desvinculado do produto "${produto.nome}".` };
  }
  if (linkExistente) return { erro: `O grupo "${grupo.nome}" j\xE1 est\xE1 vinculado ao produto "${produto.nome}".` };
  const { error } = await supabase.from("menu_item_modifiers").insert({ menu_item_id: produto.id, modifier_id: grupo.id });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Grupo "${grupo.nome}" vinculado ao produto "${produto.nome}".` };
}
async function definirIngredientesCopoPronto(supabase, args) {
  if (!args.produto?.trim()) return { erro: "Nome do produto \xE9 obrigat\xF3rio." };
  const { encontrado: produto, todos: produtos, erro: erroProduto } = await buscarPorNome(
    supabase,
    "menu_items",
    "id, nome",
    args.produto
  );
  if (erroProduto) return { erro: erroProduto };
  if (!produto) return { erro: `Produto "${args.produto}" n\xE3o encontrado.`, produtos_existentes: produtos.map((p) => p.nome) };
  if (args.desmarcar) {
    const { error: delErr2 } = await supabase.from("menu_item_ingredientes").delete().eq("menu_item_id", produto.id);
    if (delErr2) return { erro: delErr2.message };
    const { error } = await supabase.from("menu_items").update({ copo_pronto: false }).eq("id", produto.id);
    if (error) return { erro: error.message };
    return { sucesso: true, mensagem: `Produto "${produto.nome}" n\xE3o \xE9 mais um copo pronto.` };
  }
  if (!args.ingredientes || args.ingredientes.length === 0) {
    return { erro: "Informe a lista de ingredientes (nomes de adicionais j\xE1 cadastrados) pra marcar como copo pronto." };
  }
  const { data: todasOpcoes, error: erroOpcoes } = await supabase.from("modifier_options").select("id, nome");
  if (erroOpcoes) return { erro: erroOpcoes.message };
  const opcoes = todasOpcoes ?? [];
  const idsEncontrados = [];
  const naoEncontrados = [];
  for (const nomeIngrediente of args.ingredientes) {
    const termo = nomeIngrediente.trim().toLowerCase();
    const opcao = opcoes.find((o) => o.nome.toLowerCase() === termo) ?? opcoes.find((o) => o.nome.toLowerCase().includes(termo));
    if (opcao) idsEncontrados.push(opcao.id);
    else naoEncontrados.push(nomeIngrediente);
  }
  if (naoEncontrados.length > 0) {
    return {
      erro: `Adicional n\xE3o encontrado: ${naoEncontrados.join(", ")}. S\xF3 d\xE1 pra usar adicionais j\xE1 cadastrados (ver Adicionais no painel).`,
      adicionais_existentes: opcoes.map((o) => o.nome)
    };
  }
  const { error: delErr } = await supabase.from("menu_item_ingredientes").delete().eq("menu_item_id", produto.id);
  if (delErr) return { erro: delErr.message };
  const { error: insErr } = await supabase.from("menu_item_ingredientes").insert(
    idsEncontrados.map((modifier_option_id, ordem) => ({ menu_item_id: produto.id, modifier_option_id, ordem }))
  );
  if (insErr) return { erro: insErr.message };
  const { error: prodErr } = await supabase.from("menu_items").update({ copo_pronto: true }).eq("id", produto.id);
  if (prodErr) return { erro: prodErr.message };
  return {
    sucesso: true,
    mensagem: `Produto "${produto.nome}" marcado como copo pronto, com ${idsEncontrados.length} ingrediente(s).`
  };
}
async function definirComposicaoProduto(supabase, args) {
  if (!args.produto?.trim()) return { erro: "Nome do produto \xE9 obrigat\xF3rio." };
  if (!args.itens || args.itens.length === 0) {
    return { erro: "Informe a lista de insumos e quantidades que comp\xF5em a receita fixa do produto." };
  }
  const { encontrado: produto, todos: produtos, erro: erroProduto } = await buscarPorNome(
    supabase,
    "menu_items",
    "id, nome",
    args.produto
  );
  if (erroProduto) return { erro: erroProduto };
  if (!produto) return { erro: `Produto "${args.produto}" n\xE3o encontrado.`, produtos_existentes: produtos.map((p) => p.nome) };
  const { data: todosInsumos, error: erroInsumos } = await supabase.from("insumos").select("id, nome, unidade, gramas_por_litro").eq("ativo", true);
  if (erroInsumos) return { erro: erroInsumos.message };
  const insumos = todosInsumos ?? [];
  const linhas = [];
  const naoEncontrados = [];
  for (const item of args.itens) {
    if (!item.insumo?.trim() || !(Number(item.quantidade) > 0)) {
      return { erro: "Cada item precisa de um insumo e uma quantidade maior que zero." };
    }
    const termo = item.insumo.trim().toLowerCase();
    const insumo = insumos.find((i) => i.nome.toLowerCase() === termo) ?? insumos.find((i) => i.nome.toLowerCase().includes(termo));
    if (!insumo) {
      naoEncontrados.push(item.insumo);
      continue;
    }
    const emGramas = (insumo.unidade === "l" || insumo.unidade === "ml") && insumo.gramas_por_litro;
    let quantidade = Number(item.quantidade);
    if (emGramas) {
      const litros = quantidade / insumo.gramas_por_litro;
      quantidade = insumo.unidade === "ml" ? litros * 1e3 : litros;
    }
    linhas.push({ insumo_id: insumo.id, quantidade });
  }
  if (naoEncontrados.length > 0) {
    return {
      erro: `Insumo n\xE3o encontrado: ${naoEncontrados.join(", ")}.`,
      insumos_existentes: insumos.map((i) => i.nome)
    };
  }
  const { error: delErr } = await supabase.from("menu_item_insumos").delete().eq("menu_item_id", produto.id);
  if (delErr) return { erro: delErr.message };
  const { error: insErr } = await supabase.from("menu_item_insumos").insert(linhas.map((l) => ({ menu_item_id: produto.id, insumo_id: l.insumo_id, quantidade: l.quantidade })));
  if (insErr) return { erro: insErr.message };
  return {
    sucesso: true,
    mensagem: `Composi\xE7\xE3o do produto "${produto.nome}" atualizada, com ${linhas.length} insumo(s).`
  };
}
async function criarFornecedor(supabase, args) {
  if (args.nome_atual?.trim()) {
    const { encontrado: fornecedor, todos, erro } = await buscarPorNome(
      supabase,
      "fornecedores",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!fornecedor) {
      return { erro: `Fornecedor "${args.nome_atual}" n\xE3o encontrado.`, fornecedores_existentes: todos.map((f) => f.nome) };
    }
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (args.contato !== void 0) patch.contato = args.contato.trim() || null;
    if (args.telefone !== void 0) patch.telefone = args.telefone.trim() || null;
    if (args.email !== void 0) patch.email = args.email.trim() || null;
    if (args.ativo !== void 0) patch.ativo = args.ativo;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar." };
    const { error: error2 } = await supabase.from("fornecedores").update(patch).eq("id", fornecedor.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Fornecedor "${fornecedor.nome}" atualizado.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome do fornecedor \xE9 obrigat\xF3rio." };
  const nome = args.nome.trim();
  const { error } = await supabase.from("fornecedores").insert({
    nome,
    contato: args.contato?.trim() || null,
    telefone: args.telefone?.trim() || null,
    email: args.email?.trim() || null,
    ativo: true
  });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Fornecedor "${nome}" criado.` };
}
async function criarPedidoCompra(supabase, args) {
  if (!args.fornecedor?.trim()) return { erro: "Fornecedor \xE9 obrigat\xF3rio." };
  const { encontrado: fornecedor, todos: fornecedores, erro: erroFornecedor } = await buscarPorNome(supabase, "fornecedores", "id, nome", args.fornecedor);
  if (erroFornecedor) return { erro: erroFornecedor };
  if (!fornecedor) {
    return { erro: `Fornecedor "${args.fornecedor}" n\xE3o encontrado.`, fornecedores_existentes: fornecedores.map((f) => f.nome) };
  }
  if (!args.itens || args.itens.length === 0) {
    return { erro: "Informe pelo menos um item (insumo e quantidade) pra este pedido." };
  }
  const status = args.status === "aguardando_recebimento" ? "aguardando_recebimento" : "rascunho";
  const { data: todosInsumos, error: erroInsumos } = await supabase.from("insumos").select("id, nome").eq("ativo", true);
  if (erroInsumos) return { erro: erroInsumos.message };
  const insumos = todosInsumos ?? [];
  const linhas = [];
  const naoEncontrados = [];
  for (const item of args.itens) {
    if (!item.insumo?.trim() || !(Number(item.quantidade) > 0)) {
      return { erro: "Cada item precisa de um insumo e uma quantidade maior que zero." };
    }
    const termo = item.insumo.trim().toLowerCase();
    const insumo = insumos.find((i) => i.nome.toLowerCase() === termo) ?? insumos.find((i) => i.nome.toLowerCase().includes(termo));
    if (!insumo) {
      naoEncontrados.push(item.insumo);
      continue;
    }
    linhas.push({ insumo_id: insumo.id, quantidade: Number(item.quantidade), valor_unitario: item.valor_unitario ?? null });
  }
  if (naoEncontrados.length > 0) {
    return { erro: `Insumo n\xE3o encontrado: ${naoEncontrados.join(", ")}.`, insumos_existentes: insumos.map((i) => i.nome) };
  }
  const { data: pedido, error: erroPedido } = await supabase.from("pedidos_compra").insert({ fornecedor_id: fornecedor.id, status, observacoes: args.observacoes?.trim() || null }).select("id").single();
  if (erroPedido) return { erro: erroPedido.message };
  const { error: erroItens } = await supabase.from("pedido_compra_itens").insert(linhas.map((l) => ({ ...l, pedido_compra_id: pedido.id })));
  if (erroItens) {
    await supabase.from("pedidos_compra").delete().eq("id", pedido.id);
    return { erro: erroItens.message };
  }
  return {
    sucesso: true,
    mensagem: `Pedido de compra criado para "${fornecedor.nome}" com ${linhas.length} item(ns), status "${status === "rascunho" ? "rascunho" : "aguardando recebimento"}". Pra dar entrada no estoque, marque como recebido na lista de Compras.`
  };
}
async function criarImposto(supabase, args) {
  let insumoId;
  let insumoNome;
  if (args.insumo?.trim()) {
    const { encontrado, todos, erro } = await buscarPorNome(supabase, "insumos", "id, nome", args.insumo);
    if (erro) return { erro };
    if (!encontrado) return { erro: `Insumo "${args.insumo}" n\xE3o encontrado.`, insumos_existentes: todos.map((i) => i.nome) };
    insumoId = encontrado.id;
    insumoNome = encontrado.nome;
  }
  if (args.nome_atual?.trim()) {
    const { encontrado: imposto, todos, erro } = await buscarPorNome(
      supabase,
      "impostos",
      "id, nome",
      args.nome_atual
    );
    if (erro) return { erro };
    if (!imposto) return { erro: `Imposto "${args.nome_atual}" n\xE3o encontrado.`, impostos_existentes: todos.map((i) => i.nome) };
    const patch = {};
    if (args.nome?.trim()) patch.nome = args.nome.trim();
    if (args.tipo) patch.tipo = args.tipo === "fixo" ? "fixo" : "percentual";
    if (args.valor !== void 0) patch.valor = args.valor;
    if (insumoId !== void 0) patch.insumo_id = insumoId;
    if (args.ativo !== void 0) patch.ativo = args.ativo;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar." };
    const { error: error2 } = await supabase.from("impostos").update(patch).eq("id", imposto.id);
    if (error2) return { erro: error2.message };
    return { sucesso: true, mensagem: `Imposto "${imposto.nome}" atualizado.` };
  }
  if (!args.nome?.trim()) return { erro: "Nome do imposto \xE9 obrigat\xF3rio." };
  if (!(Number(args.valor) > 0)) return { erro: "Valor \xE9 obrigat\xF3rio e precisa ser maior que zero." };
  const tipo = args.tipo === "fixo" ? "fixo" : "percentual";
  const nome = args.nome.trim();
  const valor = Number(args.valor);
  const { error } = await supabase.from("impostos").insert({ nome, tipo, valor, insumo_id: insumoId ?? null, ativo: true });
  if (error) return { erro: error.message };
  return {
    sucesso: true,
    mensagem: `Imposto "${nome}" criado${insumoNome ? `, vinculado a "${insumoNome}"` : ""}.`
  };
}
async function criarGorjeta(supabase, args) {
  if (args.valor_atual !== void 0) {
    const { data: tips, error: error2 } = await supabase.from("tip_options").select("id, tipo, valor, ativo");
    if (error2) return { erro: error2.message };
    const tip = (tips ?? []).find((t) => t.valor === args.valor_atual);
    if (!tip) {
      return {
        erro: `Nenhuma op\xE7\xE3o de gorjeta com valor ${args.valor_atual} encontrada.`,
        gorjetas_existentes: (tips ?? []).map(
          (t) => t.tipo === "percentual" ? `${t.valor}%` : `CHF ${t.valor}`
        )
      };
    }
    const patch = {};
    if (args.tipo) patch.tipo = args.tipo === "fixo" ? "fixo" : "percentual";
    if (args.valor !== void 0) patch.valor = args.valor;
    if (args.ativo !== void 0) patch.ativo = args.ativo;
    if (Object.keys(patch).length === 0) return { erro: "Nada pra alterar." };
    const { error: updErr } = await supabase.from("tip_options").update(patch).eq("id", tip.id);
    if (updErr) return { erro: updErr.message };
    return { sucesso: true, mensagem: "Op\xE7\xE3o de gorjeta atualizada." };
  }
  if (!(Number(args.valor) > 0)) return { erro: "Valor \xE9 obrigat\xF3rio e precisa ser maior que zero." };
  const tipo = args.tipo === "fixo" ? "fixo" : "percentual";
  const valor = Number(args.valor);
  const descricao = tipo === "percentual" ? `${valor}%` : `CHF ${valor.toFixed(2)}`;
  const ordem = await proximaOrdem(supabase, "tip_options");
  const { error } = await supabase.from("tip_options").insert({ tipo, valor, ativo: true, ordem });
  if (error) return { erro: error.message };
  return { sucesso: true, mensagem: `Op\xE7\xE3o de gorjeta ${descricao} criada.` };
}
var CONFIG_ESTOQUE_ID = "00000000-0000-0000-0000-000000000001";
async function definirFechamentoAutomatico(supabase, args) {
  if (args.ativo === void 0) return { erro: "Informe se o fechamento autom\xE1tico deve ficar ligado ou desligado." };
  const { error } = await supabase.from("configuracoes_estoque").update({ fechamento_automatico: args.ativo }).eq("id", CONFIG_ESTOQUE_ID);
  if (error) return { erro: error.message };
  return {
    sucesso: true,
    mensagem: `Fechamento autom\xE1tico de estoque ${args.ativo ? "ligado" : "desligado"}.`
  };
}
async function registrarMovimentacaoEstoque(supabase, callerId, args) {
  if (!args.insumo?.trim()) return { erro: "Insumo \xE9 obrigat\xF3rio." };
  if (args.direcao !== "entrada" && args.direcao !== "saida") return { erro: 'Dire\xE7\xE3o \xE9 obrigat\xF3ria: "entrada" ou "saida".' };
  if (!(Number(args.quantidade) > 0)) return { erro: "Quantidade \xE9 obrigat\xF3ria e precisa ser maior que zero." };
  const { encontrado: insumo, todos, erro } = await buscarPorNome(
    supabase,
    "insumos",
    "id, nome, unidade",
    args.insumo
  );
  if (erro) return { erro };
  if (!insumo) return { erro: `Insumo "${args.insumo}" n\xE3o encontrado.`, insumos_existentes: todos.map((i) => i.nome) };
  const quantidade = Number(args.quantidade);
  const { error: insErr } = await supabase.from("movimentacoes_estoque").insert({
    insumo_id: insumo.id,
    quantidade: args.direcao === "entrada" ? quantidade : -quantidade,
    tipo: args.direcao === "entrada" ? "entrada_manual" : "saida_manual",
    observacoes: args.observacoes?.trim() || null,
    criado_por: callerId
  });
  if (insErr) return { erro: insErr.message };
  return {
    sucesso: true,
    mensagem: `Movimenta\xE7\xE3o registrada: ${args.direcao === "entrada" ? "+" : "-"}${quantidade} ${insumo.unidade} de "${insumo.nome}".`
  };
}
var MOTIVOS_PERDA_VALIDOS = [
  "desperdicio",
  "perda",
  "produto_danificado",
  "produto_vencido",
  "erro_operacional",
  "falta_de_controle",
  "outros"
];
async function registrarPerda(supabase, callerId, args) {
  if (!args.insumo?.trim()) return { erro: "Insumo \xE9 obrigat\xF3rio." };
  if (!(Number(args.quantidade) > 0)) return { erro: "Quantidade \xE9 obrigat\xF3ria e precisa ser maior que zero." };
  if (!args.motivo || !MOTIVOS_PERDA_VALIDOS.includes(args.motivo)) {
    return { erro: `Motivo \xE9 obrigat\xF3rio e precisa ser um de: ${MOTIVOS_PERDA_VALIDOS.join(", ")}.` };
  }
  const { encontrado: insumo, todos, erro } = await buscarPorNome(
    supabase,
    "insumos",
    "id, nome, unidade",
    args.insumo
  );
  if (erro) return { erro };
  if (!insumo) return { erro: `Insumo "${args.insumo}" n\xE3o encontrado.`, insumos_existentes: todos.map((i) => i.nome) };
  const quantidade = Number(args.quantidade);
  const { data: perda, error: perdaErr } = await supabase.from("perdas").insert({
    insumo_id: insumo.id,
    quantidade,
    motivo: args.motivo,
    observacoes: args.observacoes?.trim() || null,
    origem_tipo: "manual",
    criado_por: callerId
  }).select().single();
  if (perdaErr) return { erro: perdaErr.message };
  const { error: movErr } = await supabase.from("movimentacoes_estoque").insert({
    insumo_id: insumo.id,
    quantidade: -quantidade,
    tipo: "saida_perda",
    origem_tipo: "perda",
    origem_id: perda.id,
    observacoes: args.observacoes?.trim() || null,
    criado_por: callerId
  });
  if (movErr) return { erro: movErr.message };
  return { sucesso: true, mensagem: `Perda registrada: -${quantidade} ${insumo.unidade} de "${insumo.nome}".` };
}
var TOOLS = [
  {
    functionDeclarations: [
      {
        name: "consultar_vendas",
        description: 'Consulta pedidos pagos num per\xEDodo: faturamento, gorjetas, ticket m\xE9dio, produtos mais vendidos, faturamento por forma de pagamento e por categoria do card\xE1pio, quantidade de pedidos por hora do dia (j\xE1 ordenado da hora mais cheia pra mais fraca), e lucro bruto + margem por produto (receita menos custo dos insumos, pela composi\xE7\xE3o e pelo pre\xE7o m\xE9dio pago nas compras j\xE1 recebidas \u2014 \xE9 lucro BRUTO, n\xE3o conta aluguel/taxas/outras despesas fixas; produtos em produtos_sem_custo_cadastrado ficam fora dessa conta porque algum insumo usado nunca foi comprado ou o produto n\xE3o tem composi\xE7\xE3o cadastrada). Para um dia ou intervalo espec\xEDfico (ex: "domingo passado"), use data_inicio/data_fim em vez de periodo.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            periodo: {
              type: "string",
              enum: ["hoje", "ontem", "semana", "mes"],
              description: "Atalho de per\xEDodo. Ignorado se data_inicio for informado."
            },
            data_inicio: {
              type: "string",
              description: 'Data inicial no formato AAAA-MM-DD, calculada a partir de "hoje" quando o usu\xE1rio menciona um dia espec\xEDfico.'
            },
            data_fim: {
              type: "string",
              description: "Data final (inclusive) no formato AAAA-MM-DD. Se omitida, usa o mesmo dia de data_inicio."
            }
          }
        }
      },
      {
        name: "consultar_estoque",
        description: "Consulta o saldo atual de estoque dos insumos cadastrados.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            insumo: {
              type: "string",
              description: "Nome (ou parte do nome) de um insumo espec\xEDfico. Deixe vazio para listar todos."
            }
          }
        }
      },
      {
        name: "consultar_cardapio",
        description: 'Consulta o card\xE1pio cadastrado: produtos, categorias, pre\xE7os, disponibilidade, destaque, descri\xE7\xE3o, se \xE9 um "copo pronto" e seus ingredientes (copo_pronto, ingredientes_copo_pronto), a composi\xE7\xE3o/receita fixa de insumos consumida do estoque em toda venda (composicao \u2014 ver definir_composicao_produto), e tamb\xE9m os grupos de adicionais/misturas (ex: Frutas, Toppings) com suas op\xE7\xF5es e pre\xE7o adicional. N\xE3o tem rela\xE7\xE3o com vendas \u2014 \xE9 o cat\xE1logo, vendido ou n\xE3o.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            categoria: { type: "string", description: "Nome (ou parte do nome) de uma categoria espec\xEDfica." },
            apenas_disponiveis: { type: "boolean", description: "Se true, lista s\xF3 os produtos dispon\xEDveis no totem." }
          }
        }
      },
      {
        name: "consultar_pedidos_atuais",
        description: 'Consulta o estado operacional agora: quantos pedidos est\xE3o em cada etapa da cozinha hoje (recebido/em preparo/pronto/entregue), a lista de quem est\xE1 esperando a equipe confirmar o troco (pedidos_aguardando_dinheiro), a lista de quem est\xE1 esperando a equipe confirmar o recebimento no Twint (pedidos_aguardando_twint), e a lista completa de pedidos pagos hoje com nome do cliente, status e valor (pedidos_hoje) \u2014 use isso pra perguntas tipo "quem comprou hoje?" ou "quais os nomes dos clientes de hoje?". Informe nome_cliente s\xF3 quando quiser filtrar por um cliente espec\xEDfico. S\xF3 cobre HOJE: para clientes/pedidos de outros dias (ontem, uma data, a semana), use consultar_pedidos_periodo.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_cliente: {
              type: "string",
              description: "Nome (ou parte do nome) de um cliente, para achar o(s) pedido(s) dele."
            }
          }
        }
      },
      {
        name: "consultar_pedidos_periodo",
        description: 'Lista os pedidos pagos de qualquer dia ou per\xEDodo (inclusive dias anteriores), um por um: nome do cliente, data/hora, valor, gorjeta, forma de pagamento, status e itens comprados. Use para perguntas tipo "quem comprou ontem?", "nomes dos clientes do dia 13", "o que o Jo\xE3o pediu semana passada?" ou "quando a Maria comprou pela \xFAltima vez?". Todo pedido fica salvo com o nome do cliente \u2014 nunca diga que o hist\xF3rico de nomes n\xE3o existe. Para totais (faturamento, mais vendidos) prefira consultar_vendas. Para um dia ou intervalo espec\xEDfico, use data_inicio/data_fim em vez de periodo.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            periodo: {
              type: "string",
              enum: ["hoje", "ontem", "semana", "mes"],
              description: "Atalho de per\xEDodo. Ignorado se data_inicio for informado."
            },
            data_inicio: {
              type: "string",
              description: 'Data inicial no formato AAAA-MM-DD, calculada a partir de "hoje" quando o usu\xE1rio menciona um dia espec\xEDfico.'
            },
            data_fim: {
              type: "string",
              description: "Data final (inclusive) no formato AAAA-MM-DD. Se omitida, usa o mesmo dia de data_inicio."
            },
            nome_cliente: {
              type: "string",
              description: "Nome (ou parte do nome) de um cliente, para filtrar s\xF3 os pedidos dele."
            }
          }
        }
      },
      {
        name: "consultar_movimentacoes_estoque",
        description: "Consulta o hist\xF3rico de movimenta\xE7\xF5es de estoque (entradas e sa\xEDdas de insumos) num per\xEDodo: quantas aconteceram, de que tipo (compra, venda, ajuste de invent\xE1rio, perda, manual) e as mais recentes.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            periodo: { type: "string", enum: ["hoje", "ontem", "semana", "mes"], description: "Per\xEDodo a consultar. Padr\xE3o: hoje." },
            insumo: { type: "string", description: "Nome (ou parte do nome) de um insumo espec\xEDfico." }
          }
        }
      },
      {
        name: "consultar_compras",
        description: "Consulta pedidos de compra a fornecedores: quantos existem, em que status, e o valor de cada um.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["rascunho", "aguardando_recebimento", "recebido", "cancelado"],
              description: "Filtra por status. Deixe vazio para ver todos os pedidos recentes."
            }
          }
        }
      },
      {
        name: "consultar_fornecedores",
        description: "Consulta os fornecedores cadastrados (nome, contato, ativo/inativo).",
        parametersJsonSchema: {
          type: "object",
          properties: {
            apenas_ativos: { type: "boolean", description: "Se true, lista s\xF3 os fornecedores ativos." }
          }
        }
      },
      {
        name: "consultar_perdas",
        description: "Consulta as perdas de estoque registradas num per\xEDodo: quantas, por qual motivo, e de qual insumo.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            periodo: { type: "string", enum: ["hoje", "ontem", "semana", "mes"], description: "Per\xEDodo a consultar. Padr\xE3o: hoje." }
          }
        }
      },
      {
        name: "consultar_inventarios",
        description: "Consulta o hist\xF3rico de contagens de invent\xE1rio (contagem f\xEDsica de estoque): quando, quantos insumos contados e quantas diverg\xEAncias encontradas.",
        parametersJsonSchema: { type: "object", properties: {} }
      },
      {
        name: "consultar_fechamento",
        description: "Consulta a fila do Fechamento de estoque: quantos pedidos j\xE1 pagos ainda n\xE3o tiveram o estoque baixado, agrupados por dia, com o total em CHF de cada dia. Fechar de fato (bater os insumos em lote) \xE9 uma a\xE7\xE3o manual da equipe no painel, fora do seu alcance \u2014 isto \xE9 s\xF3 a consulta de quantos/quais pedidos est\xE3o esperando.",
        parametersJsonSchema: { type: "object", properties: {} }
      },
      {
        name: "consultar_impostos",
        description: "Consulta os impostos cadastrados: nome, tipo (fixo/percentual), valor, e a qual insumo (se algum) est\xE3o vinculados.",
        parametersJsonSchema: { type: "object", properties: {} }
      },
      {
        name: "consultar_configuracoes",
        description: "Consulta as op\xE7\xF5es de gorjeta oferecidas no totem, a lista de usu\xE1rios com acesso ao painel da equipe, e se o fechamento autom\xE1tico de estoque (baixa assim que um pedido \xE9 confirmado) est\xE1 ligado.",
        parametersJsonSchema: { type: "object", properties: {} }
      },
      {
        name: "criar_categoria",
        description: 'Cadastra uma nova categoria de card\xE1pio, OU edita uma j\xE1 existente \u2014 renomeia e/ou reordena (informe nome_atual). Pra reordenar a posi\xE7\xE3o das categorias na barra lateral (ex: "bota Copos Prontos em primeiro"), use o campo `ordem`: menor valor aparece primeiro \u2014 veja os valores atuais em consultar_cardapio (categorias, j\xE1 vem ordenado por ele) antes de escolher o novo n\xFAmero. N\xE3o existe "arrastar" \u2014 \xE9 sempre editando o n\xFAmero de cada categoria.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de uma categoria J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome da categoria: novo nome ao criar, ou nome atualizado ao editar." },
            ordem: {
              type: "number",
              description: "Posi\xE7\xE3o de exibi\xE7\xE3o na barra lateral \u2014 menor aparece primeiro. Consulte os valores atuais em consultar_cardapio antes de escolher um novo n\xFAmero."
            }
          }
        }
      },
      {
        name: "criar_produto",
        description: 'Cadastra um novo produto no card\xE1pio, OU edita um j\xE1 existente (informe nome_atual). Ao editar, s\xF3 envie os campos que devem mudar. Pra reordenar a posi\xE7\xE3o de exibi\xE7\xE3o de produtos (ex: "bota o X em primeiro", "os copos prontos antes das outras op\xE7\xF5es"), use o campo `ordem`: menor valor aparece primeiro, dentro da mesma categoria; veja os valores atuais em consultar_cardapio (campo ordem de cada produto, j\xE1 vem ordenado por ele) antes de decidir o novo n\xFAmero de cada um. N\xE3o existe "arrastar" nem reordena\xE7\xE3o em lote \u2014 \xE9 sempre editando o n\xFAmero de cada produto.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de um produto J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome do produto (obrigat\xF3rio ao criar)." },
            categoria: { type: "string", description: "Nome de uma categoria j\xE1 existente (obrigat\xF3rio ao criar)." },
            preco: { type: "number", description: "Pre\xE7o em CHF (obrigat\xF3rio ao criar)." },
            disponivel: { type: "boolean", description: "Se aparece no totem. Padr\xE3o ao criar: true \u2014 s\xF3 pergunte se o usu\xE1rio mencionar." },
            destaque: { type: "boolean", description: "Se aparece em Destaques. Padr\xE3o ao criar: false \u2014 s\xF3 pergunte se o usu\xE1rio mencionar." },
            descricao: { type: "string", description: "Descri\xE7\xE3o opcional que aparece no card\xE1pio." },
            descricao_na_comanda: {
              type: "boolean",
              description: "Se true, a descri\xE7\xE3o vai carimbada na comanda impressa da cozinha em todo pedido. Padr\xE3o ao criar: false."
            },
            max_ingredientes: {
              type: "number",
              description: 'Limite combinado de quantos adicionais o cliente pode escolher (ex: "s\xF3 at\xE9 4 toppings"). Deixe vazio pra sem limite.'
            },
            ordem: {
              type: "number",
              description: "Posi\xE7\xE3o de exibi\xE7\xE3o no card\xE1pio dentro da categoria \u2014 menor aparece primeiro. Consulte os valores atuais em consultar_cardapio antes de escolher um novo n\xFAmero."
            }
          }
        }
      },
      {
        name: "criar_insumo",
        description: "Cadastra um novo insumo de estoque, OU edita um j\xE1 existente (informe nome_atual) \u2014 cobre todo campo do cadastro: nome, unidade de controle, alerta de saldo baixo (estoque_minimo), estoque m\xE1ximo (estoque_maximo), valor de refer\xEAncia por unidade (valor_unitario_padrao), ordem de exibi\xE7\xE3o e se est\xE1 ativo. Ao editar, s\xF3 envie os campos que devem mudar.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de um insumo J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome do insumo (obrigat\xF3rio ao criar)." },
            unidade: { type: "string", enum: ["kg", "g", "l", "ml", "unidade"], description: "Unidade de controle (obrigat\xF3rio ao criar)." },
            estoque_minimo: { type: "number", description: "Alerta de saldo baixo \u2014 abaixo deste saldo o insumo aparece com alerta no painel. Opcional ao criar." },
            estoque_maximo: {
              type: "number",
              description: "Capacidade m\xE1xima de estoque, na unidade de controle do insumo \u2014 usada pra mostrar quanto uma compra preenche do estoque. Opcional ao criar."
            },
            valor_unitario_padrao: {
              type: "number",
              description: "Pre\xE7o de refer\xEAncia por unidade de controle, em CHF \u2014 pr\xE9-preenche o valor ao lan\xE7ar uma compra deste insumo. Opcional ao criar."
            },
            gramas_por_litro: {
              type: "number",
              description: 'S\xF3 pra unidade "l" ou "ml": peso de 1 litro deste insumo em gramas (ex: 1030 pro a\xE7a\xED). Preenchendo isso, a composi\xE7\xE3o dos produtos passa a aceitar a quantidade em gramas em vez de litros/mililitros \u2014 o estoque continua controlado na unidade escolhida.'
            },
            ordem: { type: "number", description: "Posi\xE7\xE3o de exibi\xE7\xE3o na lista de insumos. Opcional \u2014 sem isso, um insumo novo vai pro fim da lista." },
            ativo: { type: "boolean", description: "Se o insumo est\xE1 ativo. S\xF3 ao editar." }
          }
        }
      },
      {
        name: "criar_grupo_adicional",
        description: 'Cadastra um novo grupo de adicionais/misturas (ex: "Frutas", "Toppings"), OU edita um j\xE1 existente (informe nome_atual).',
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de um grupo J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome do grupo (obrigat\xF3rio ao criar)." },
            tipo: {
              type: "string",
              enum: ["obrigatorio", "opcional"],
              description: "Se o cliente \xE9 obrigado a escolher algo desse grupo. Padr\xE3o ao criar: opcional."
            },
            selecao: {
              type: "string",
              enum: ["unica", "multipla"],
              description: "Se pode escolher mais de uma op\xE7\xE3o do grupo. Padr\xE3o ao criar: multipla."
            }
          }
        }
      },
      {
        name: "criar_opcao_adicional",
        description: 'Cadastra uma nova op\xE7\xE3o dentro de um grupo de adicionais j\xE1 existente (ex: "Banana" dentro de "Frutas"), OU edita uma op\xE7\xE3o j\xE1 existente (informe nome_atual).',
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de uma op\xE7\xE3o J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome da op\xE7\xE3o (obrigat\xF3rio ao criar)." },
            grupo: { type: "string", description: "Nome de um grupo de adicionais j\xE1 existente (obrigat\xF3rio ao criar)." },
            preco_adicional: { type: "number", description: "Quanto soma ao pre\xE7o do produto. Padr\xE3o ao criar: 0." },
            insumo: { type: "string", description: "Nome de um insumo, opcional, se essa op\xE7\xE3o deve descontar estoque." },
            quantidade_padrao: { type: "number", description: 'Quanto do insumo \xE9 consumido por escolha \u2014 obrigat\xF3rio s\xF3 quando "insumo" \xE9 informado.' },
            quantidade_maxima: {
              type: "number",
              description: 'Quantas por\xE7\xF5es desta op\xE7\xE3o o cliente pode pedir de uma vez (ex: 3 pra deixar pedir "3x Granola"). Deixe vazio pra s\xF3 marcar/desmarcar (padr\xE3o, 1 por\xE7\xE3o).'
            }
          }
        }
      },
      {
        name: "vincular_grupo_adicional",
        description: 'Vincula (ou desvincula) um grupo de adicionais j\xE1 existente a um produto j\xE1 existente \u2014 ex: colocar o grupo "Toppings" no produto "A\xE7a\xED 500ml".',
        parametersJsonSchema: {
          type: "object",
          properties: {
            produto: { type: "string", description: "Nome do produto (obrigat\xF3rio)." },
            grupo: { type: "string", description: "Nome do grupo de adicionais (obrigat\xF3rio)." },
            acao: { type: "string", enum: ["vincular", "desvincular"], description: "Padr\xE3o: vincular." }
          }
        }
      },
      {
        name: "definir_ingredientes_copo_pronto",
        description: 'Marca um produto como "copo pronto" (receita fixa, ex: um a\xE7a\xED j\xE1 montado) e define a lista de ingredientes que aparece pro cliente no bot\xE3o "Ver ingredientes" do card\xE1pio \u2014 reaproveitando adicionais j\xE1 cadastrados (ver criar_opcao_adicional), nunca criando um novo. A lista informada em `ingredientes` SUBSTITUI a lista inteira, n\xE3o soma \xE0s existentes \u2014 ao editar, sempre pe\xE7a a lista completa que deve ficar valendo. Use desmarcar=true pra tirar a marca\xE7\xE3o de copo pronto (some o bot\xE3o do card\xE1pio).',
        parametersJsonSchema: {
          type: "object",
          properties: {
            produto: { type: "string", description: "Nome do produto (obrigat\xF3rio)." },
            ingredientes: {
              type: "array",
              items: { type: "string" },
              description: "Nomes dos adicionais j\xE1 cadastrados que comp\xF5em o copo pronto \u2014 lista completa, substitui a anterior. Obrigat\xF3rio, a n\xE3o ser que desmarcar=true."
            },
            desmarcar: { type: "boolean", description: 'true pra tirar a marca\xE7\xE3o de copo pronto do produto (ignora "ingredientes").' }
          }
        }
      },
      {
        name: "definir_composicao_produto",
        description: "Define a composi\xE7\xE3o/receita fixa de insumos de um produto \u2014 o que \xE9 debitado do estoque em toda venda dele, independente das misturas que o cliente escolher (ex: A\xE7a\xED 500ml = 400g de a\xE7a\xED + 1 copo). N\xE3o \xE9 a mesma coisa que adicionais/ingredientes do copo pronto (ver definir_ingredientes_copo_pronto) \u2014 aqui s\xE3o insumos de estoque (ver criar_insumo), com quantidade. A lista em `itens` SUBSTITUI a composi\xE7\xE3o inteira, n\xE3o soma \xE0 existente \u2014 ao editar, sempre pe\xE7a a lista completa que deve ficar valendo.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            produto: { type: "string", description: "Nome do produto (obrigat\xF3rio)." },
            itens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  insumo: { type: "string", description: "Nome de um insumo j\xE1 cadastrado." },
                  quantidade: {
                    type: "number",
                    description: "Quantidade consumida por unidade vendida do produto. Na unidade de controle do insumo, ou em gramas se o insumo tiver densidade cadastrada (ver criar_insumo/gramas_por_litro) \u2014 mesmo comportamento da composi\xE7\xE3o no Painel da Equipe."
                  }
                }
              },
              description: "Lista completa de insumo + quantidade que comp\xF5em a receita \u2014 substitui a composi\xE7\xE3o anterior inteira."
            }
          }
        }
      },
      {
        name: "criar_fornecedor",
        description: "Cadastra um novo fornecedor, OU edita um j\xE1 existente (informe nome_atual).",
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de um fornecedor J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome do fornecedor (obrigat\xF3rio ao criar)." },
            contato: { type: "string", description: "Nome da pessoa de contato, opcional." },
            telefone: { type: "string", description: "Telefone, opcional." },
            email: { type: "string", description: "E-mail, opcional." },
            ativo: { type: "boolean", description: "Se o fornecedor est\xE1 ativo. S\xF3 ao editar." }
          }
        }
      },
      {
        name: "criar_pedido_compra",
        description: 'Cria um novo pedido de compra a um fornecedor, com os itens (insumo, quantidade e opcionalmente valor unit\xE1rio) j\xE1 lan\xE7ados. S\xF3 cria \u2014 n\xE3o edita um pedido existente. O status s\xF3 pode ser rascunho ou aguardando_recebimento: "recebido" (o que d\xE1 entrada no estoque) nunca se define aqui, s\xF3 manualmente na lista de Compras, ao confirmar a entrega f\xEDsica.',
        parametersJsonSchema: {
          type: "object",
          properties: {
            fornecedor: { type: "string", description: "Nome de um fornecedor j\xE1 cadastrado (obrigat\xF3rio)." },
            status: {
              type: "string",
              enum: ["rascunho", "aguardando_recebimento"],
              description: "Padr\xE3o: rascunho. Use aguardando_recebimento quando o pedido j\xE1 foi confirmado com o fornecedor."
            },
            observacoes: { type: "string", description: "Observa\xE7\xF5es do pedido, opcional." },
            itens: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  insumo: { type: "string", description: "Nome de um insumo j\xE1 cadastrado." },
                  quantidade: { type: "number", description: "Quantidade comprada, na unidade de controle do insumo." },
                  valor_unitario: { type: "number", description: "Pre\xE7o por unidade em CHF, opcional." }
                }
              },
              description: "Itens do pedido \u2014 pelo menos um item, com insumo e quantidade, \xE9 obrigat\xF3rio."
            }
          }
        }
      },
      {
        name: "criar_imposto",
        description: "Cadastra um novo imposto, OU edita um j\xE1 existente (informe nome_atual).",
        parametersJsonSchema: {
          type: "object",
          properties: {
            nome_atual: { type: "string", description: "Nome de um imposto J\xC1 EXISTENTE \u2014 informe isso pra EDITAR em vez de criar." },
            nome: { type: "string", description: "Nome do imposto (obrigat\xF3rio ao criar)." },
            tipo: { type: "string", enum: ["fixo", "percentual"], description: "Como \xE9 calculado (obrigat\xF3rio ao criar)." },
            valor: { type: "number", description: "Percentual ou valor fixo em CHF por unidade (obrigat\xF3rio ao criar)." },
            insumo: { type: "string", description: "Nome de um insumo, opcional, se o imposto for vinculado a ele." },
            ativo: { type: "boolean", description: "Se o imposto est\xE1 ativo. S\xF3 ao editar." }
          }
        }
      },
      {
        name: "criar_gorjeta",
        description: "Cadastra uma nova op\xE7\xE3o de gorjeta do totem, OU edita uma j\xE1 existente (informe valor_atual pra identificar qual).",
        parametersJsonSchema: {
          type: "object",
          properties: {
            valor_atual: { type: "number", description: "Valor de uma op\xE7\xE3o de gorjeta J\xC1 EXISTENTE (o n\xFAmero, sem % nem CHF) \u2014 informe isso pra EDITAR em vez de criar." },
            tipo: { type: "string", enum: ["fixo", "percentual"], description: "Como \xE9 calculado (obrigat\xF3rio ao criar)." },
            valor: { type: "number", description: "Percentual ou valor fixo em CHF (obrigat\xF3rio ao criar)." },
            ativo: { type: "boolean", description: "Se aparece no totem. S\xF3 ao editar." }
          }
        }
      },
      {
        name: "definir_fechamento_automatico",
        description: "Liga ou desliga a baixa autom\xE1tica de estoque assim que um pedido \xE9 confirmado (mesmo switch do painel de Fechamento) \u2014 sem isso ligado, a equipe precisa bater o estoque manualmente.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            ativo: { type: "boolean", description: "true liga, false desliga (obrigat\xF3rio)." }
          }
        }
      },
      {
        name: "registrar_movimentacao_estoque",
        description: "Registra uma entrada ou sa\xEDda manual de estoque de um insumo (ex: corre\xE7\xE3o de contagem, uso interno).",
        parametersJsonSchema: {
          type: "object",
          properties: {
            insumo: { type: "string", description: "Nome de um insumo j\xE1 existente (obrigat\xF3rio)." },
            direcao: { type: "string", enum: ["entrada", "saida"], description: "Se aumenta ou diminui o saldo (obrigat\xF3rio)." },
            quantidade: { type: "number", description: "Quantidade, na unidade do insumo (obrigat\xF3rio)." },
            observacoes: { type: "string", description: "Motivo do lan\xE7amento, opcional." }
          }
        }
      },
      {
        name: "registrar_perda",
        description: "Registra uma perda de estoque avulsa (fora de uma contagem de invent\xE1rio) \u2014 ex: produto estragado ou quebrado.",
        parametersJsonSchema: {
          type: "object",
          properties: {
            insumo: { type: "string", description: "Nome de um insumo j\xE1 existente (obrigat\xF3rio)." },
            quantidade: { type: "number", description: "Quantidade perdida, na unidade do insumo (obrigat\xF3rio)." },
            motivo: {
              type: "string",
              enum: ["desperdicio", "perda", "produto_danificado", "produto_vencido", "erro_operacional", "falta_de_controle", "outros"],
              description: "Motivo da perda (obrigat\xF3rio)."
            },
            observacoes: { type: "string", description: "Detalhes adicionais, opcional." }
          }
        }
      }
    ]
  }
];
function previewDaConversa(contents) {
  for (const c of contents) {
    if (c.role !== "user") continue;
    const texto = c.parts?.find((p) => typeof p.text === "string")?.text;
    if (texto) return texto.length > 60 ? `${texto.slice(0, 60)}\u2026` : texto;
  }
  return "";
}
async function salvarConversa(supabase, usuarioId, contents, conversaId) {
  if (conversaId) {
    await supabase.from("assistente_conversas").update({ contents, atualizado_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conversaId).eq("usuario_id", usuarioId);
    return conversaId;
  }
  const { data } = await supabase.from("assistente_conversas").insert({ usuario_id: usuarioId, contents }).select("id").single();
  return data?.id ?? null;
}
async function handler2(req, res) {
  if (!geminiApiKey || !supabaseUrl3 || !serviceRoleKey2) {
    res.status(500).json({ error: "Servidor n\xE3o configurado." });
    return;
  }
  const caller = await requireCaller(req);
  if (!caller) {
    res.status(401).json({ error: "N\xE3o autenticado." });
    return;
  }
  const supabase = createClient3(supabaseUrl3, serviceRoleKey2, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  if (req.method === "GET") {
    if (req.query.list !== void 0) {
      const { data: data2, error: error2 } = await supabase.from("assistente_conversas").select("id, contents, criado_em, atualizado_em").eq("usuario_id", caller.id).order("atualizado_em", { ascending: false }).limit(50);
      if (error2) {
        res.status(500).json({ error: error2.message });
        return;
      }
      const conversas = (data2 ?? []).map((c) => ({
        id: c.id,
        preview: previewDaConversa(c.contents ?? []),
        atualizadoEm: c.atualizado_em
      }));
      res.status(200).json({ conversas });
      return;
    }
    const id = typeof req.query.id === "string" ? req.query.id : null;
    let query = supabase.from("assistente_conversas").select("id, contents").eq("usuario_id", caller.id);
    query = id ? query.eq("id", id) : query.order("atualizado_em", { ascending: false }).limit(1);
    const { data, error } = await query.maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ conversaId: data?.id ?? null, contents: data?.contents ?? [] });
    return;
  }
  if (req.method === "DELETE") {
    const id = typeof req.query.id === "string" ? req.query.id : null;
    if (!id) {
      res.status(400).json({ error: "Id da conversa \xE9 obrigat\xF3rio." });
      return;
    }
    const { error } = await supabase.from("assistente_conversas").delete().eq("id", id).eq("usuario_id", caller.id);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = Array.isArray(req.body?.contents) ? req.body.contents : [];
  const conversaId = typeof req.body?.conversaId === "string" ? req.body.conversaId : null;
  const imagemBody = req.body?.imagem;
  const imagemBase64 = typeof imagemBody?.base64 === "string" ? imagemBody.base64 : null;
  const imagemMimeType = typeof imagemBody?.mimeType === "string" ? imagemBody.mimeType : null;
  const temImagem = !!imagemBase64 && !!imagemMimeType?.startsWith("image/");
  if (!message && !temImagem) {
    res.status(400).json({ error: "Mensagem vazia." });
    return;
  }
  if (temImagem && imagemBase64.length > 6e6) {
    res.status(400).json({ error: "Essa foto \xE9 grande demais \u2014 tenta uma imagem menor." });
    return;
  }
  const client = new GoogleGenAI({ apiKey: geminiApiKey });
  const userParts = [];
  if (temImagem) userParts.push({ inlineData: { data: imagemBase64, mimeType: imagemMimeType } });
  if (message) userParts.push({ text: message });
  const contents = [...history, createUserContent(userParts)];
  const systemInstruction = buildSystemInstruction();
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await generateContentComRetry(client, {
        model: MODEL,
        contents,
        config: { systemInstruction, tools: TOOLS }
      });
      const calls = response.functionCalls;
      if (!calls || calls.length === 0) {
        const reply = stripMarkdown(response.text ?? "N\xE3o consegui responder isso agora.");
        contents.push(createModelContent(reply));
        const idSalvo2 = await salvarConversa(supabase, caller.id, contents, conversaId);
        res.status(200).json({ reply, contents, conversaId: idSalvo2 });
        return;
      }
      const modelContent = response.candidates?.[0]?.content;
      contents.push(
        modelContent ?? { role: "model", parts: calls.map((c) => createPartFromFunctionCall(c.name ?? "", c.args ?? {})) }
      );
      const responseParts = await Promise.all(
        calls.map(async (call) => {
          const args = call.args ?? {};
          let resultado;
          if (call.name === "consultar_vendas") resultado = await consultarVendas(supabase, args);
          else if (call.name === "consultar_estoque") resultado = await consultarEstoque(supabase, args);
          else if (call.name === "consultar_cardapio") resultado = await consultarCardapio(supabase, args);
          else if (call.name === "consultar_pedidos_atuais") resultado = await consultarPedidosAtuais(supabase, args);
          else if (call.name === "consultar_pedidos_periodo") resultado = await consultarPedidosPeriodo(supabase, args);
          else if (call.name === "consultar_movimentacoes_estoque") resultado = await consultarMovimentacoesEstoque(supabase, args);
          else if (call.name === "consultar_compras") resultado = await consultarCompras(supabase, args);
          else if (call.name === "consultar_fornecedores") resultado = await consultarFornecedores(supabase, args);
          else if (call.name === "consultar_perdas") resultado = await consultarPerdas(supabase, args);
          else if (call.name === "consultar_inventarios") resultado = await consultarInventarios(supabase);
          else if (call.name === "consultar_fechamento") resultado = await consultarFechamento(supabase);
          else if (call.name === "consultar_impostos") resultado = await consultarImpostos(supabase);
          else if (call.name === "consultar_configuracoes") resultado = await consultarConfiguracoes(supabase);
          else if (call.name === "criar_categoria") resultado = await criarCategoria(supabase, args);
          else if (call.name === "criar_produto") resultado = await criarProduto(supabase, args);
          else if (call.name === "criar_insumo") resultado = await criarInsumo(supabase, args);
          else if (call.name === "criar_grupo_adicional") resultado = await criarGrupoAdicional(supabase, args);
          else if (call.name === "criar_opcao_adicional") resultado = await criarOpcaoAdicional(supabase, args);
          else if (call.name === "vincular_grupo_adicional") resultado = await vincularGrupoAdicional(supabase, args);
          else if (call.name === "definir_ingredientes_copo_pronto") resultado = await definirIngredientesCopoPronto(supabase, args);
          else if (call.name === "definir_composicao_produto") resultado = await definirComposicaoProduto(supabase, args);
          else if (call.name === "definir_fechamento_automatico") resultado = await definirFechamentoAutomatico(supabase, args);
          else if (call.name === "criar_fornecedor") resultado = await criarFornecedor(supabase, args);
          else if (call.name === "criar_pedido_compra") resultado = await criarPedidoCompra(supabase, args);
          else if (call.name === "criar_imposto") resultado = await criarImposto(supabase, args);
          else if (call.name === "criar_gorjeta") resultado = await criarGorjeta(supabase, args);
          else if (call.name === "registrar_movimentacao_estoque")
            resultado = await registrarMovimentacaoEstoque(supabase, caller.id, args);
          else if (call.name === "registrar_perda") resultado = await registrarPerda(supabase, caller.id, args);
          else resultado = { error: `Ferramenta desconhecida: ${call.name}` };
          return createPartFromFunctionResponse(
            call.id ?? call.name ?? "",
            call.name ?? "",
            resultado
          );
        })
      );
      contents.push({ role: "user", parts: responseParts });
    }
    const idSalvo = await salvarConversa(supabase, caller.id, contents, conversaId);
    res.status(200).json({
      reply: "Essa pergunta ficou grande demais pra eu responder agora \u2014 tenta ser mais espec\xEDfico?",
      contents,
      conversaId: idSalvo
    });
  } catch (err) {
    const sobrecarga = err instanceof ApiError && (err.status === 503 || err.status === 429);
    res.status(502).json({
      error: sobrecarga ? "A IA est\xE1 sobrecarregada agora. Espera alguns segundos e tenta de novo." : "N\xE3o consegui falar com a assistente agora. Tenta de novo em instantes."
    });
  }
}

// api/balanca-pedido.ts
import { timingSafeEqual } from "node:crypto";
import { createClient as createClient4 } from "@supabase/supabase-js";

// api/_sumupReader.ts
var sumupApiKey = process.env.SUMUP_API_KEY;
var sumupMerchantCode = process.env.SUMUP_MERCHANT_CODE;
var sumupAffiliateKey = process.env.SUMUP_AFFILIATE_KEY;
var CURRENCY = "CHF";
function sumupError(data) {
  if (!data) return null;
  const deErrors = Array.isArray(data.errors) ? data.errors[0]?.message ?? data.errors[0]?.detail : data.errors?.message ?? data.errors?.detail;
  const candidato = data.message ?? data.error_message ?? data.error?.message ?? deErrors;
  return typeof candidato === "string" && candidato.trim() ? candidato : null;
}
async function startReaderCheckout(readerId2, orderId, total, description) {
  try {
    const readerRes = await fetch(
      `https://api.sumup.com/v0.1/merchants/${encodeURIComponent(sumupMerchantCode)}/readers/${encodeURIComponent(readerId2)}/checkout`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sumupApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          total_amount: {
            currency: CURRENCY,
            // `value` vai em unidades menores: 29.80 -> 2980 centavos.
            minor_unit: 2,
            value: Math.round(total * 100)
          },
          description,
          affiliate: {
            app_id: "ch.forestacai.totem",
            key: sumupAffiliateKey,
            // É por aqui que /api/sumup-confirm-payment reencontra a transação.
            foreign_transaction_id: orderId
          }
        })
      }
    );
    if (readerRes.ok) return true;
    const body = await readerRes.json().catch(() => null);
    console.error("SumUp recusou a cobran\xE7a na maquininha", {
      orderId,
      status: readerRes.status,
      reader: readerId2,
      motivo: sumupError(body),
      body
    });
    return false;
  } catch (err) {
    console.error("Maquininha n\xE3o respondeu", {
      orderId,
      reader: readerId2,
      erro: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}

// api/balanca-pedido.ts
var supabaseUrl4 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey3 = process.env.SUPABASE_SERVICE_ROLE_KEY;
var sumupApiKey2 = process.env.SUMUP_API_KEY;
var sumupMerchantCode2 = process.env.SUMUP_MERCHANT_CODE;
var readerId = process.env.SUMUP_READER_ID_BALANCA;
var balancaToken = process.env.BALANCA_TOKEN;
var precoPor100g = Number(process.env.BALANCA_PRECO_100G);
var taraG = Number(process.env.BALANCA_TARA_G ?? 0) || 0;
var pesoMaxG = Number(process.env.BALANCA_PESO_MAX_G ?? 1500) || 1500;
var PESO_MIN_G = 10;
function tokenValido(req) {
  const enviado = req.headers["x-balanca-token"];
  if (!balancaToken || typeof enviado !== "string") return false;
  const a = Buffer.from(enviado);
  const b = Buffer.from(balancaToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function handler3(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl4 || !serviceRoleKey3 || !sumupApiKey2 || !sumupMerchantCode2 || !readerId || !balancaToken) {
    res.status(500).json({ error: "Balan\xE7a n\xE3o configurada (vari\xE1veis de ambiente ausentes)." });
    return;
  }
  if (!(precoPor100g > 0)) {
    res.status(500).json({ error: "Balan\xE7a n\xE3o configurada (BALANCA_PRECO_100G inv\xE1lido)." });
    return;
  }
  if (!tokenValido(req)) {
    res.status(401).json({ error: "C\xF3digo do totem inv\xE1lido." });
    return;
  }
  if (req.method === "GET") {
    res.status(200).json({ precoPor100g, taraG, pesoMaxG });
    return;
  }
  const peso = Number(req.body?.pesoGramas);
  if (!Number.isFinite(peso) || peso < PESO_MIN_G || peso > pesoMaxG) {
    res.status(400).json({ error: "Peso inv\xE1lido." });
    return;
  }
  const pesoGramas = Math.round(peso);
  const total = Number((pesoGramas / 100 * precoPor100g).toFixed(2));
  if (!(total > 0)) {
    res.status(400).json({ error: "Valor do pedido inv\xE1lido." });
    return;
  }
  const supabase = createClient4(supabaseUrl4, serviceRoleKey3, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    status: "aguardando_pagamento",
    valor_pago: total,
    gorjeta: 0,
    nome_cliente: "Self-service",
    origem: "balanca"
  }).select().single();
  if (orderErr || !order) {
    console.error("balanca-pedido: falha ao inserir em orders", orderErr);
    res.status(400).json({ error: orderErr?.message ?? "N\xE3o foi poss\xEDvel criar o pedido." });
    return;
  }
  const { error: itemErr } = await supabase.from("order_items").insert({
    order_id: order.id,
    menu_item_id: null,
    nome_item: "A\xE7a\xED self-service",
    quantidade: 1,
    observacoes: `${pesoGramas} g \xD7 CHF ${precoPor100g.toFixed(2)}/100 g`,
    modifiers_selecionados: [],
    preco_unitario: total
  });
  if (itemErr) {
    console.error("balanca-pedido: falha ao inserir em order_items", { orderId: order.id, itemErr });
    await supabase.from("orders").delete().eq("id", order.id);
    res.status(400).json({ error: itemErr.message });
    return;
  }
  const aceita = await startReaderCheckout(readerId, order.id, total, `Self-service ${pesoGramas} g \u2014 Forest A\xE7a\xED`);
  if (!aceita) {
    await supabase.from("orders").update({ status: "cancelado" }).eq("id", order.id);
    res.status(502).json({ code: "reader_unavailable", error: "N\xE3o foi poss\xEDvel parear com o leitor." });
    return;
  }
  res.status(200).json({ orderId: order.id, total, pesoGramas });
}

// api/cancel-order.ts
import { createClient as createClient5 } from "@supabase/supabase-js";
var supabaseUrl5 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey4 = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function handler4(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl5 || !serviceRoleKey4) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (SUPABASE_SERVICE_ROLE_KEY ausente)." });
    return;
  }
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : null;
  if (!orderId) {
    res.status(400).json({ error: "ID do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const supabase = createClient5(supabaseUrl5, serviceRoleKey4, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await supabase.from("orders").update({ status: "cancelado" }).eq("id", orderId).in("status", ["aguardando_dinheiro", "aguardando_twint"]).select().maybeSingle();
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(409).json({ error: "Pedido j\xE1 n\xE3o est\xE1 mais aguardando pagamento." });
    return;
  }
  res.status(200).json({ ok: true });
}

// api/create-cash-order.ts
import { createClient as createClient6 } from "@supabase/supabase-js";

// api/_orderPricing.ts
async function withRetry(label, attempt) {
  let result = await attempt();
  for (let i = 0; result.error && i < 2; i++) {
    console.error(`Supabase falhou em ${label} (tentativa ${i + 1}), tentando de novo`, result.error);
    await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
    result = await attempt();
  }
  return result;
}
async function resolveTip(supabase, enviado, subtotal) {
  if (typeof enviado !== "number" || !Number.isFinite(enviado) || enviado <= 0) return 0;
  const { data, error } = await supabase.from("tip_options").select("tipo, valor").eq("ativo", true);
  if (error || !data) return 0;
  const permitidos = data.map((o) => {
    const bruto = o.tipo === "fixo" ? Number(o.valor) : subtotal * Number(o.valor) / 100;
    return Math.round(bruto * 100) / 100;
  });
  return permitidos.includes(Math.round(enviado * 100) / 100) ? enviado : 0;
}
var MAX_QUANTIDADE_POR_ITEM = 30;
async function resolveItems(supabase, raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cartItems = raw;
  const menuItemIds = [...new Set(cartItems.map((it) => it.menu_item_id))];
  if (menuItemIds.some((id) => typeof id !== "string" || !id)) return null;
  const optionIds = [
    ...new Set(
      cartItems.flatMap(
        (it) => Array.isArray(it.modifiers_selecionados) ? it.modifiers_selecionados.map((o) => o.option_id).filter((id) => typeof id === "string" && id.length > 0) : []
      )
    )
  ];
  const [menuItemsRes, optionsRes] = await Promise.all([
    withRetry(
      "menu_items",
      () => supabase.from("menu_items").select("id, nome, descricao, preco, disponivel, descricao_na_comanda").in("id", menuItemIds)
    ),
    optionIds.length > 0 ? withRetry(
      "modifier_options",
      () => supabase.from("modifier_options").select("id, modifier_id, nome, nome_i18n, preco_adicional, quantidade_maxima").in("id", optionIds)
    ) : Promise.resolve({ data: [], error: null })
  ]);
  if (menuItemsRes.error || !menuItemsRes.data || optionsRes.error || !optionsRes.data) {
    console.error("resolveItems: n\xE3o deu pra ler menu_items/modifier_options", {
      menuItemsError: menuItemsRes.error,
      optionsError: optionsRes.error
    });
    return null;
  }
  const modifierIds = [...new Set(optionsRes.data.map((o) => o.modifier_id))];
  const modifiersRes = modifierIds.length > 0 ? await withRetry("modifiers", () => supabase.from("modifiers").select("id, nome").in("id", modifierIds)) : { data: [], error: null };
  if (modifiersRes.error || !modifiersRes.data) {
    console.error("resolveItems: n\xE3o deu pra ler modifiers", modifiersRes.error);
    return null;
  }
  const menuItemById = new Map(menuItemsRes.data.map((m) => [m.id, m]));
  const optionById = new Map(optionsRes.data.map((o) => [o.id, o]));
  const modifierNameById = new Map(
    modifiersRes.data.map((g) => [g.id, g.nome])
  );
  const resolved = [];
  for (const it of cartItems) {
    const quantidade = Number(it.quantidade);
    if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > MAX_QUANTIDADE_POR_ITEM) {
      console.error("resolveItems: quantidade fora do razo\xE1vel", { menu_item_id: it.menu_item_id, quantidade: it.quantidade });
      return null;
    }
    const menuItem = menuItemById.get(it.menu_item_id);
    if (!menuItem || !menuItem.disponivel) {
      console.error("resolveItems: item inexistente ou indispon\xEDvel", { menu_item_id: it.menu_item_id });
      return null;
    }
    const rawOptions = Array.isArray(it.modifiers_selecionados) ? it.modifiers_selecionados : [];
    const resolvedOptions = [];
    let addOnTotal = 0;
    for (const raw2 of rawOptions) {
      if (typeof raw2.option_id !== "string") {
        console.error("resolveItems: option_id ausente/inv\xE1lido no carrinho", { menu_item_id: it.menu_item_id });
        return null;
      }
      const option = optionById.get(raw2.option_id);
      if (!option) {
        console.error("resolveItems: op\xE7\xE3o de modifier inexistente", { menu_item_id: it.menu_item_id, option_id: raw2.option_id });
        return null;
      }
      const maximoOpcao = option.quantidade_maxima ?? 1;
      const optQuantidade = raw2.quantidade === void 0 ? 1 : Number(raw2.quantidade);
      if (!Number.isInteger(optQuantidade) || optQuantidade < 1 || optQuantidade > maximoOpcao) {
        console.error("resolveItems: quantidade de op\xE7\xE3o fora do permitido", {
          menu_item_id: it.menu_item_id,
          option_id: raw2.option_id,
          quantidade: raw2.quantidade,
          maximo: maximoOpcao
        });
        return null;
      }
      addOnTotal += Number(option.preco_adicional) * optQuantidade;
      resolvedOptions.push({
        modifier_id: option.modifier_id,
        modifier_nome: modifierNameById.get(option.modifier_id) ?? "",
        option_id: option.id,
        option_nome: option.nome,
        option_nome_i18n: option.nome_i18n ?? {},
        preco_adicional: Number(option.preco_adicional),
        quantidade: optQuantidade
      });
    }
    resolved.push({
      menu_item_id: menuItem.id,
      nome_item: menuItem.nome,
      quantidade,
      observacoes: typeof it.observacoes === "string" ? it.observacoes.trim().slice(0, 500) || null : null,
      modifiers_selecionados: resolvedOptions,
      preco_unitario: Math.round((Number(menuItem.preco) + addOnTotal) * 100) / 100,
      descricao_item: menuItem.descricao_na_comanda && menuItem.descricao ? menuItem.descricao : null
    });
  }
  return resolved;
}

// api/create-cash-order.ts
var supabaseUrl6 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey5 = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function handler5(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl6 || !serviceRoleKey5) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (SUPABASE_SERVICE_ROLE_KEY ausente)." });
    return;
  }
  const { items, customerName, tip } = req.body ?? {};
  if (typeof customerName !== "string" || !customerName.trim()) {
    res.status(400).json({ error: "Nome do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const cleanCustomerName = customerName.trim().slice(0, 80);
  const supabase = createClient6(supabaseUrl6, serviceRoleKey5, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const cartItems = await resolveItems(supabase, items);
  if (!cartItems) {
    res.status(400).json({ error: "Pedido inv\xE1lido." });
    return;
  }
  const subtotal = cartItems.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0);
  if (!(subtotal > 0)) {
    res.status(400).json({ error: "Valor do pedido inv\xE1lido." });
    return;
  }
  const tipAmount = await resolveTip(supabase, tip, subtotal);
  const total = Number((subtotal + tipAmount).toFixed(2));
  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    status: "aguardando_dinheiro",
    valor_pago: total,
    gorjeta: tipAmount,
    nome_cliente: cleanCustomerName
  }).select().single();
  if (orderErr || !order) {
    console.error("create-cash-order: falha ao inserir em orders", orderErr);
    res.status(400).json({ error: orderErr?.message ?? "N\xE3o foi poss\xEDvel criar o pedido." });
    return;
  }
  const orderItemsPayload = cartItems.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id,
    nome_item: it.nome_item,
    quantidade: it.quantidade,
    observacoes: it.observacoes,
    modifiers_selecionados: it.modifiers_selecionados,
    preco_unitario: it.preco_unitario,
    descricao_item: it.descricao_item
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);
  if (itemsErr) {
    console.error("create-cash-order: falha ao inserir em order_items", { orderId: order.id, itemsErr });
    await supabase.from("orders").delete().eq("id", order.id);
    res.status(400).json({ error: itemsErr.message });
    return;
  }
  res.status(200).json({ orderId: order.id, total });
}

// api/create-twint-order.ts
import { createClient as createClient7 } from "@supabase/supabase-js";
var supabaseUrl7 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey6 = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function handler6(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl7 || !serviceRoleKey6) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (SUPABASE_SERVICE_ROLE_KEY ausente)." });
    return;
  }
  const { items, customerName, tip } = req.body ?? {};
  if (typeof customerName !== "string" || !customerName.trim()) {
    res.status(400).json({ error: "Nome do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const cleanCustomerName = customerName.trim().slice(0, 80);
  const supabase = createClient7(supabaseUrl7, serviceRoleKey6, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const cartItems = await resolveItems(supabase, items);
  if (!cartItems) {
    res.status(400).json({ error: "Pedido inv\xE1lido." });
    return;
  }
  const subtotal = cartItems.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0);
  if (!(subtotal > 0)) {
    res.status(400).json({ error: "Valor do pedido inv\xE1lido." });
    return;
  }
  const tipAmount = await resolveTip(supabase, tip, subtotal);
  const total = Number((subtotal + tipAmount).toFixed(2));
  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    status: "aguardando_twint",
    valor_pago: total,
    gorjeta: tipAmount,
    nome_cliente: cleanCustomerName
  }).select().single();
  if (orderErr || !order) {
    console.error("create-twint-order: falha ao inserir em orders", orderErr);
    res.status(400).json({ error: orderErr?.message ?? "N\xE3o foi poss\xEDvel criar o pedido." });
    return;
  }
  const orderItemsPayload = cartItems.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id,
    nome_item: it.nome_item,
    quantidade: it.quantidade,
    observacoes: it.observacoes,
    modifiers_selecionados: it.modifiers_selecionados,
    preco_unitario: it.preco_unitario,
    descricao_item: it.descricao_item
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);
  if (itemsErr) {
    console.error("create-twint-order: falha ao inserir em order_items", { orderId: order.id, itemsErr });
    await supabase.from("orders").delete().eq("id", order.id);
    res.status(400).json({ error: itemsErr.message });
    return;
  }
  res.status(200).json({ orderId: order.id, total });
}

// api/order-status.ts
import { createClient as createClient8 } from "@supabase/supabase-js";
var supabaseUrl8 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey7 = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function handler7(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl8 || !serviceRoleKey7) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (SUPABASE_SERVICE_ROLE_KEY ausente)." });
    return;
  }
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : null;
  if (!orderId) {
    res.status(400).json({ error: "ID do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const supabase = createClient8(supabaseUrl8, serviceRoleKey7, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: "Pedido n\xE3o encontrado." });
    return;
  }
  res.status(200).json({ status: data.status });
}

// api/receipt.ts
import { createClient as createClient9 } from "@supabase/supabase-js";
var supabaseUrl9 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey8 = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function handler8(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl9 || !serviceRoleKey8) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (SUPABASE_SERVICE_ROLE_KEY ausente)." });
    return;
  }
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : null;
  if (!orderId) {
    res.status(400).json({ error: "ID do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const supabase = createClient9(supabaseUrl9, serviceRoleKey8, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await supabase.from("orders").select(
    "id, status, criado_em, pago_em, valor_pago, gorjeta, nome_cliente, forma_pagamento, order_items(id, nome_item, quantidade, preco_unitario, modifiers_selecionados, observacoes)"
  ).eq("id", orderId).maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: "Pedido n\xE3o encontrado." });
    return;
  }
  res.status(200).json({ order: data });
}

// api/sumup-confirm-payment.ts
import { createClient as createClient10 } from "@supabase/supabase-js";

// api/_estoqueConsumo.ts
var CONFIG_ID = "00000000-0000-0000-0000-000000000001";
async function fechamentoAutomaticoAtivo(supabase) {
  const { data } = await supabase.from("configuracoes_estoque").select("fechamento_automatico").eq("id", CONFIG_ID).maybeSingle();
  return data?.fechamento_automatico ?? false;
}
async function baixarEstoqueDoPedido(supabase, orderId) {
  try {
    const { data: order } = await supabase.from("orders").select("id, estoque_baixado").eq("id", orderId).maybeSingle();
    if (!order || order.estoque_baixado) return;
    const { data: itemsData } = await supabase.from("order_items").select("menu_item_id, quantidade, modifiers_selecionados").eq("order_id", orderId);
    const items = itemsData ?? [];
    const menuItemIds = [...new Set(items.map((i) => i.menu_item_id).filter((id) => !!id))];
    const optionIds = [...new Set(items.flatMap((i) => (i.modifiers_selecionados ?? []).map((m) => m.option_id)))];
    const [composicaoRes, optionsRes] = await Promise.all([
      menuItemIds.length > 0 ? supabase.from("menu_item_insumos").select("menu_item_id, insumo_id, quantidade").in("menu_item_id", menuItemIds) : Promise.resolve({ data: [] }),
      optionIds.length > 0 ? supabase.from("modifier_options").select("id, insumo_id, quantidade_padrao").in("id", optionIds) : Promise.resolve({ data: [] })
    ]);
    const composicaoPorItem = /* @__PURE__ */ new Map();
    for (const row of composicaoRes.data ?? []) {
      const list = composicaoPorItem.get(row.menu_item_id) ?? [];
      list.push(row);
      composicaoPorItem.set(row.menu_item_id, list);
    }
    const optionById = new Map((optionsRes.data ?? []).map((o) => [o.id, o]));
    const porInsumo = /* @__PURE__ */ new Map();
    for (const item of items) {
      if (item.menu_item_id) {
        for (const linha of composicaoPorItem.get(item.menu_item_id) ?? []) {
          porInsumo.set(linha.insumo_id, (porInsumo.get(linha.insumo_id) ?? 0) + linha.quantidade * item.quantidade);
        }
      }
      for (const mod of item.modifiers_selecionados ?? []) {
        const opcao = optionById.get(mod.option_id);
        if (!opcao?.insumo_id || !opcao.quantidade_padrao) continue;
        porInsumo.set(
          opcao.insumo_id,
          (porInsumo.get(opcao.insumo_id) ?? 0) + opcao.quantidade_padrao * (mod.quantidade ?? 1) * item.quantidade
        );
      }
    }
    if (porInsumo.size > 0) {
      await supabase.from("movimentacoes_estoque").insert(
        [...porInsumo.entries()].map(([insumo_id, quantidade]) => ({
          insumo_id,
          quantidade: -quantidade,
          tipo: "saida_venda",
          origem_tipo: "order",
          origem_id: orderId,
          criado_por: null
        }))
      );
    }
    await supabase.from("orders").update({ estoque_baixado: true, baixado_em: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", orderId);
  } catch {
  }
}

// api/sumup-confirm-payment.ts
var supabaseUrl10 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey9 = process.env.SUPABASE_SERVICE_ROLE_KEY;
var sumupApiKey3 = process.env.SUMUP_API_KEY;
var sumupMerchantCode3 = process.env.SUMUP_MERCHANT_CODE;
async function fetchTapTransaction(orderId) {
  const url = `https://api.sumup.com/v2.1/merchants/${encodeURIComponent(sumupMerchantCode3)}/transactions?foreign_transaction_id=${encodeURIComponent(orderId)}`;
  const txRes = await fetch(url, { headers: { Authorization: `Bearer ${sumupApiKey3}` } });
  if (!txRes.ok) return null;
  const txData = await txRes.json();
  const tx = Array.isArray(txData) ? txData[0] : txData?.items?.[0] ?? txData;
  return typeof tx?.status === "string" ? tx : null;
}
var ENTRY_MODE_LABEL = {
  CONTACTLESS: "Kontaktlos",
  CHIP: "Chip",
  MAGSTRIPE: "Magnetstreifen",
  MANUAL_ENTRY: "Manuell erfasst",
  BOARDING: "Kontaktlos"
};
var PAYMENT_TYPE_LABEL = {
  ECOM: "Online",
  POS: "Kartenterminal",
  RECURRING: "Wiederkehrend",
  BOLETO: "Boleto",
  PIX: "Pix",
  IDEAL: "iDEAL",
  BANCONTACT: "Bancontact",
  BLIK: "BLIK",
  SOFORT: "Sofort",
  GOOGLE_PAY: "Google Pay",
  APPLE_PAY: "Apple Pay"
};
function describePaymentMethod(source) {
  if (!source) return null;
  const tx = source.transactions?.[0] ?? source;
  const entryMode = typeof tx.entry_mode === "string" ? ENTRY_MODE_LABEL[tx.entry_mode] : null;
  const paymentType = typeof tx.payment_type === "string" ? PAYMENT_TYPE_LABEL[tx.payment_type] : null;
  const base = entryMode ?? paymentType;
  if (!base) return null;
  const brand = typeof tx.card?.type === "string" ? tx.card.type : null;
  return brand ? `${base} \xB7 ${brand}` : base;
}
async function handler9(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl10 || !serviceRoleKey9 || !sumupApiKey3) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (vari\xE1veis de ambiente do SumUp ausentes)." });
    return;
  }
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : null;
  if (!orderId) {
    res.status(400).json({ error: "ID do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const supabase = createClient10(supabaseUrl10, serviceRoleKey9, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: order, error: orderErr } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (orderErr || !order) {
    res.status(404).json({ error: "Pedido n\xE3o encontrado." });
    return;
  }
  if (order.status !== "aguardando_pagamento") {
    res.status(200).json({ status: order.status });
    return;
  }
  let paid = false;
  let stillPending = false;
  let paymentMethod = null;
  if (order.sumup_checkout_id) {
    let sumupStatus = null;
    let lastCheckData = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const checkRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${order.sumup_checkout_id}`, {
        headers: { Authorization: `Bearer ${sumupApiKey3}` }
      });
      const checkData = await checkRes.json();
      if (!checkRes.ok) {
        res.status(400).json({ error: checkData?.message ?? "N\xE3o foi poss\xEDvel verificar o pagamento." });
        return;
      }
      lastCheckData = checkData;
      sumupStatus = checkData.status;
      if (sumupStatus !== "PENDING") break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    paid = sumupStatus === "PAID";
    stillPending = sumupStatus === "PENDING";
    if (paid) paymentMethod = describePaymentMethod(lastCheckData);
  } else {
    if (!sumupMerchantCode3) {
      res.status(500).json({ error: "Servidor n\xE3o configurado (SUMUP_MERCHANT_CODE ausente)." });
      return;
    }
    let tx = null;
    let txStatus = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      tx = await fetchTapTransaction(orderId);
      txStatus = typeof tx?.status === "string" ? tx.status : null;
      if (txStatus && txStatus !== "PENDING") break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    paid = txStatus === "SUCCESSFUL";
    if (paid) paymentMethod = describePaymentMethod(tx);
    stillPending = txStatus === null || txStatus === "PENDING";
  }
  if (paid) {
    const selfService = order.origem === "balanca";
    const { data: updated, error: updateErr } = await supabase.from("orders").update(
      selfService ? { status: "entregue", forma_pagamento: paymentMethod, pago_em: (/* @__PURE__ */ new Date()).toISOString() } : { status: "recebido", forma_pagamento: paymentMethod }
    ).eq("id", orderId).eq("status", "aguardando_pagamento").select("id");
    if (updateErr) {
      console.error("sumup-confirm-payment: falha ao marcar como recebido", { orderId, updateErr });
      res.status(500).json({ error: "Pagamento confirmado, mas n\xE3o foi poss\xEDvel registrar o pedido." });
      return;
    }
    if (updated && updated.length > 0) {
      try {
        if (await fechamentoAutomaticoAtivo(supabase)) await baixarEstoqueDoPedido(supabase, orderId);
      } catch (err) {
        console.error("sumup-confirm-payment: falha na baixa de estoque", { orderId, err });
      }
    }
    res.status(200).json({ status: selfService ? "entregue" : "recebido" });
    return;
  }
  if (stillPending) {
    res.status(200).json({ status: "aguardando_pagamento" });
    return;
  }
  await supabase.from("orders").update({ status: "cancelado" }).eq("id", orderId);
  res.status(200).json({ status: "cancelado" });
}

// api/sumup-create-checkout.ts
import { createClient as createClient11 } from "@supabase/supabase-js";
var supabaseUrl11 = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
var serviceRoleKey10 = process.env.SUPABASE_SERVICE_ROLE_KEY;
var sumupApiKey4 = process.env.SUMUP_API_KEY;
var sumupMerchantCode4 = process.env.SUMUP_MERCHANT_CODE;
var sumupReaderId = process.env.SUMUP_READER_ID;
var sumupAffiliateKey2 = process.env.SUMUP_AFFILIATE_KEY;
async function handler10(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!supabaseUrl11 || !serviceRoleKey10 || !sumupApiKey4 || !sumupMerchantCode4) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (vari\xE1veis de ambiente do SumUp ausentes)." });
    return;
  }
  const { items, customerName, tip } = req.body ?? {};
  const useReader = Boolean(sumupReaderId && sumupAffiliateKey2);
  if (typeof customerName !== "string" || !customerName.trim()) {
    res.status(400).json({ error: "Nome do pedido \xE9 obrigat\xF3rio." });
    return;
  }
  const cleanCustomerName = customerName.trim().slice(0, 80);
  const supabase = createClient11(supabaseUrl11, serviceRoleKey10, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const cartItems = await resolveItems(supabase, items);
  if (!cartItems) {
    res.status(400).json({ error: "Pedido inv\xE1lido." });
    return;
  }
  const subtotal = cartItems.reduce((sum, it) => sum + it.preco_unitario * it.quantidade, 0);
  if (!(subtotal > 0)) {
    res.status(400).json({ error: "Valor do pedido inv\xE1lido." });
    return;
  }
  const tipAmount = await resolveTip(supabase, tip, subtotal);
  const total = Number((subtotal + tipAmount).toFixed(2));
  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    status: "aguardando_pagamento",
    valor_pago: total,
    gorjeta: tipAmount,
    nome_cliente: cleanCustomerName
  }).select().single();
  if (orderErr || !order) {
    console.error("sumup-create-checkout: falha ao inserir em orders", orderErr);
    res.status(400).json({ error: orderErr?.message ?? "N\xE3o foi poss\xEDvel criar o pedido." });
    return;
  }
  const orderItemsPayload = cartItems.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id,
    nome_item: it.nome_item,
    quantidade: it.quantidade,
    observacoes: it.observacoes,
    modifiers_selecionados: it.modifiers_selecionados,
    preco_unitario: it.preco_unitario,
    descricao_item: it.descricao_item
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsPayload);
  if (itemsErr) {
    console.error("sumup-create-checkout: falha ao inserir em order_items", { orderId: order.id, itemsErr });
    await supabase.from("orders").delete().eq("id", order.id);
    res.status(400).json({ error: itemsErr.message });
    return;
  }
  if (useReader) {
    const aceita = await startReaderCheckout(
      sumupReaderId,
      order.id,
      total,
      [cleanCustomerName, "Forest A\xE7a\xED"].join(" \u2014 ")
    );
    if (!aceita) {
      await supabase.from("orders").update({ status: "cancelado" }).eq("id", order.id);
      res.status(502).json({ code: "reader_unavailable", error: "N\xE3o foi poss\xEDvel parear com o leitor." });
      return;
    }
    res.status(200).json({ orderId: order.id, mode: "reader" });
    return;
  }
  const origin = `https://${req.headers.host}`;
  const redirectUrl = `${origin}/mesa/?pedido=${order.id}`;
  try {
    const checkoutRes = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sumupApiKey4}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        checkout_reference: order.id,
        amount: total,
        currency: CURRENCY,
        merchant_code: sumupMerchantCode4,
        description: [cleanCustomerName, "Forest A\xE7a\xED"].filter(Boolean).join(" \u2014 "),
        redirect_url: redirectUrl,
        hosted_checkout: { enabled: true }
      })
    });
    const checkoutData = await checkoutRes.json().catch(() => null);
    if (!checkoutRes.ok || !checkoutData?.hosted_checkout_url) {
      console.error("SumUp recusou o checkout hospedado", {
        orderId: order.id,
        status: checkoutRes.status,
        body: checkoutData
      });
      await supabase.from("orders").update({ status: "cancelado" }).eq("id", order.id);
      res.status(400).json({
        code: "payment_start_failed",
        error: sumupError(checkoutData) ?? "N\xE3o foi poss\xEDvel iniciar o pagamento."
      });
      return;
    }
    await supabase.from("orders").update({ sumup_checkout_id: checkoutData.id }).eq("id", order.id);
    res.status(200).json({
      orderId: order.id,
      mode: "hosted",
      hostedCheckoutUrl: checkoutData.hosted_checkout_url
    });
  } catch (err) {
    await supabase.from("orders").update({ status: "cancelado" }).eq("id", order.id);
    res.status(502).json({
      code: "payment_start_failed",
      error: err instanceof Error ? err.message : "Erro ao contatar o SumUp."
    });
  }
}

// api/translate.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
var geminiApiKey2 = process.env.GEMINI_API_KEY;
var TARGET_LANGS = ["fr", "it", "en", "pt", "es"];
var LANG_NAMES = {
  fr: "French",
  it: "Italian",
  en: "English",
  pt: "Brazilian Portuguese",
  es: "Spanish"
};
var TRANSLATABLE_FIELDS = ["nome", "descricao"];
var SYSTEM_INSTRUCTION = `You translate menu content for Forest A\xE7a\xED, a Brazilian a\xE7a\xED shop in Switzerland. The source language is German.

Translate for a printed menu, not prose: keep the same register, length, and punctuation style as the German. A two-word item name stays a two-word item name.

Leave untranslated anything that is a name rather than a word: the shop's own product names, Brazilian ingredients that are known by their Brazilian name (A\xE7a\xED, Cupua\xE7u, Graviola, Maracuj\xE1, Caju, Caj\xE1, Acerola, Pa\xE7oca, Tapioka), and commercial brands (Nutella, Oreo, Biscoff, Ovomaltine, M&M, Smarties). Translate ordinary food words normally.

Keep units and numbers exactly as written (300 ml stays 300 ml). Preserve capitalization conventions of the target language.`;
function buildSchema(fields) {
  const perLanguage = {
    type: "object",
    properties: Object.fromEntries(fields.map((f) => [f, { type: "string" }])),
    required: fields
  };
  return {
    type: "object",
    properties: Object.fromEntries(TARGET_LANGS.map((l) => [l, perLanguage])),
    required: [...TARGET_LANGS]
  };
}
async function handler11(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!geminiApiKey2) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (GEMINI_API_KEY ausente)." });
    return;
  }
  if (!await requireCaller(req)) {
    res.status(401).json({ error: "N\xE3o autenticado." });
    return;
  }
  const texts = req.body?.texts;
  if (!texts || typeof texts !== "object") {
    res.status(400).json({ error: "Nada para traduzir." });
    return;
  }
  const fields = TRANSLATABLE_FIELDS.filter(
    (f) => typeof texts[f] === "string" && texts[f].trim()
  );
  if (fields.length === 0) {
    res.status(400).json({ error: "Nada para traduzir." });
    return;
  }
  const source = Object.fromEntries(fields.map((f) => [f, texts[f].trim()]));
  const client = new GoogleGenAI2({ apiKey: geminiApiKey2 });
  try {
    const interaction = await client.interactions.create({
      model: "gemini-3.6-flash",
      system_instruction: SYSTEM_INSTRUCTION,
      input: `Translate into ${TARGET_LANGS.map((l) => LANG_NAMES[l]).join(", ")}:

${JSON.stringify(source, null, 2)}`,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: buildSchema(fields)
      }
    });
    const output = interaction.output_text;
    if (!output) {
      res.status(502).json({ error: "Resposta de tradu\xE7\xE3o vazia." });
      return;
    }
    res.status(200).json({ translations: JSON.parse(output) });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao traduzir." });
  }
}

// api/tuco-voz.ts
import { GoogleGenAI as GoogleGenAI3 } from "@google/genai";
var geminiApiKey3 = process.env.GEMINI_API_KEY;
var MODEL2 = "gemini-3.1-flash-tts-preview";
var VOZ = "Puck";
var MAX_CARACTERES = 1500;
async function handler12(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "M\xE9todo n\xE3o permitido." });
    return;
  }
  if (!geminiApiKey3) {
    res.status(500).json({ error: "Servidor n\xE3o configurado (GEMINI_API_KEY ausente)." });
    return;
  }
  if (!await requireCaller(req)) {
    res.status(401).json({ error: "N\xE3o autenticado." });
    return;
  }
  const texto = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, MAX_CARACTERES) : "";
  if (!texto) {
    res.status(400).json({ error: "Nada para falar." });
    return;
  }
  let cancelado = false;
  req.on("close", () => {
    cancelado = true;
  });
  let comecou = false;
  try {
    const client = new GoogleGenAI3({ apiKey: geminiApiKey3 });
    const stream = await client.interactions.create({
      model: MODEL2,
      input: `Fale em portugu\xEAs do Brasil, como o Tuco, um tucano mascote simp\xE1tico e bem-humorado: tom animado e caloroso, ritmo natural e leve, sem exagero. Leia exatamente o texto abaixo:

${texto}`,
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice: VOZ, language: "pt-BR" }]
      },
      stream: true
    });
    for await (const evento of stream) {
      if (cancelado) break;
      if (evento.event_type !== "step.delta" || evento.delta.type !== "audio" || !evento.delta.data) continue;
      if (!comecou) {
        comecou = true;
        res.status(200);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("X-Sample-Rate", String(evento.delta.sample_rate ?? 24e3));
        res.setHeader("Cache-Control", "no-store");
      }
      res.write(Buffer.from(evento.delta.data, "base64"));
    }
    if (!comecou) {
      res.status(502).json({ error: "Resposta de voz vazia." });
      return;
    }
    res.end();
  } catch (err) {
    if (comecou) {
      res.end();
      return;
    }
    res.status(502).json({ error: err instanceof Error ? err.message : "Erro ao gerar a voz." });
  }
}

// server/index.ts
var routes = {
  "admin-users": handler,
  "assistant-chat": handler2,
  "balanca-pedido": handler3,
  "cancel-order": handler4,
  "create-cash-order": handler5,
  "create-twint-order": handler6,
  "order-status": handler7,
  receipt: handler8,
  "sumup-confirm-payment": handler9,
  "sumup-create-checkout": handler10,
  translate: handler11,
  "tuco-voz": handler12
};
var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
var distDir = path.join(root, "dist");
var MAX_BODY = 15 * 1024 * 1024;
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body-too-large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
function decorate(res) {
  const r = res;
  r.status = (code) => {
    res.statusCode = code;
    return r;
  };
  r.json = (body) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return r;
  };
  r.send = (body) => {
    if (body !== null && typeof body === "object" && !Buffer.isBuffer(body)) return r.json(body);
    res.end(body);
    return r;
  };
  return r;
}
async function handleApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const handler13 = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : void 0;
  if (!handler13) return sendJson(res, 404, { error: "Rota n\xE3o encontrada." });
  const r = req;
  r.query = Object.fromEntries(url.searchParams);
  r.body = void 0;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const raw = await readBody(req);
      const type = String(req.headers["content-type"] ?? "");
      if (raw.length === 0) r.body = void 0;
      else if (type.includes("application/json")) r.body = JSON.parse(raw.toString("utf8"));
      else r.body = raw.toString("utf8");
    } catch (e) {
      const tooLarge = e instanceof Error && e.message === "body-too-large";
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? "Corpo grande demais." : "JSON inv\xE1lido." });
    }
  }
  try {
    await handler13(r, decorate(res));
  } catch (e) {
    console.error(`[api/${name}]`, e);
    if (!res.headersSent) sendJson(res, 500, { error: "Erro interno." });
    else res.end();
  }
}
async function serveStatic(req, res, url) {
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  let file = path.join(distDir, rel);
  if (file !== distDir && !file.startsWith(distDir + path.sep)) {
    res.statusCode = 403;
    return res.end();
  }
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) {
    if (!rel.endsWith("/")) {
      res.statusCode = 301;
      res.setHeader("Location", url.pathname + "/" + url.search);
      return res.end();
    }
    file = path.join(file, "index.html");
    info = await stat(file).catch(() => null);
  }
  if (!info?.isFile()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("N\xE3o encontrado");
  }
  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : ext === ".html" || path.basename(file) === "sw.js" ? "no-cache" : "public, max-age=3600";
  res.setHeader("Cache-Control", cache);
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
  let start = 0;
  let end = info.size - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(info.size - Number(range[2]), 0);
    }
    if (start > end || start >= info.size) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${info.size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
  }
  res.setHeader("Content-Length", end - start + 1);
  if (req.method === "HEAD") return res.end();
  createReadStream(file, { start, end }).pipe(res);
}
var server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      return res.end();
    }
    if (url.pathname === "/") {
      res.statusCode = 302;
      res.setHeader("Location", "/mesa/" + url.search);
      return res.end();
    }
    if (url.pathname === "/apps" || url.pathname === "/apps/") url.pathname = "/index.html";
    await serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  }
});
var port = Number(process.env.PORT) || 3e3;
server.listen(port, () => console.log(`Servidor no ar na porta ${port}`));
