export type ModifierTipo = 'obrigatorio' | 'opcional'
export type ModifierSelecao = 'unica' | 'multipla'
/** Status visíveis no quadro da cozinha (Painel da Equipe). */
export type OrderStatus = 'recebido' | 'em_preparo' | 'pronto' | 'entregue'
/**
 * Status completo, incluindo os quatro estados de pagamento que nunca chegam
 * ao quadro da cozinha: `aguardando_pagamento` (cartão, aguardando a SumUp),
 * `aguardando_dinheiro` (aguardando a equipe confirmar o troco no caixa),
 * `aguardando_twint` (aguardando a equipe confirmar o recebimento no Twint) e
 * `cancelado`.
 */
export type FullOrderStatus =
  | 'aguardando_pagamento'
  | 'aguardando_dinheiro'
  | 'aguardando_twint'
  | OrderStatus
  | 'cancelado'

export const ORDER_STATUS_FLOW: OrderStatus[] = ['recebido', 'em_preparo', 'pronto', 'entregue']

/** Os quatro status que já passaram pelo pagamento e chegam à cozinha. */
export const PAID_STATUSES: FullOrderStatus[] = ['recebido', 'em_preparo', 'pronto', 'entregue']

export function isPaidStatus(status: FullOrderStatus): boolean {
  return PAID_STATUSES.includes(status)
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  recebido: 'Recebido',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  entregue: 'Entregue',
}

export interface Category {
  id: string
  nome: string
  ordem: number
  /** Traduções manuais do nome por idioma (chaves: fr, it, en, pt, es). Alemão vem de `nome`. */
  nome_i18n: Record<string, string>
}

export interface MenuItem {
  id: string
  categoria_id: string
  nome: string
  descricao: string | null
  preco: number
  foto_url: string | null
  disponivel: boolean
  /** Escolhido a dedo pela equipe para aparecer na página "Destaques" do cardápio. */
  destaque: boolean
  /** Se true, a descrição vai carimbada em `order_items.descricao_item` a cada pedido e aparece na comanda da cozinha. */
  descricao_na_comanda: boolean
  /** Produto com receita fixa (ex: um açaí já montado) — mostra ao cliente um
   * botão "Ver ingredientes" com a lista em `MenuItemWithModifiers.ingredientes`. */
  copo_pronto: boolean
  ordem: number
  /** Limite combinado de seleções nos grupos com `conta_para_limite`, ex: "escolha até 4". null = sem limite. */
  max_ingredientes: number | null
  /** Traduções manuais da descrição por idioma (chaves: fr, it, en, pt, es). Alemão vem de `descricao`. */
  descricao_i18n: Record<string, string>
  /** Traduções manuais do nome por idioma (chaves: fr, it, en, pt, es). Alemão vem de `nome`. */
  nome_i18n: Record<string, string>
}

export interface Modifier {
  id: string
  nome: string
  tipo: ModifierTipo
  selecao: ModifierSelecao
  /** Se true, opções escolhidas neste grupo contam para `MenuItem.max_ingredientes`. */
  conta_para_limite: boolean
  /** Limite de opções selecionáveis dentro deste grupo. null = sem limite. */
  max_selecoes: number | null
  /** Traduções manuais do nome por idioma (chaves: fr, it, en, pt, es). Alemão vem de `nome`. */
  nome_i18n: Record<string, string>
}

export interface ModifierOption {
  id: string
  modifier_id: string
  nome: string
  preco_adicional: number
  ordem: number
  /** Foto da opção, mostrada ao cliente ao montar o pedido. null = só o nome. */
  foto_url: string | null
  /** Traduções manuais do nome por idioma (chaves: fr, it, en, pt, es). Alemão vem de `nome`. */
  nome_i18n: Record<string, string>
  /** Insumo consumido quando esta opção é escolhida. null = fora da baixa automática de estoque. */
  insumo_id: string | null
  /** Quanto desse insumo é consumido por unidade do item, na unidade do próprio insumo (ver Insumo.unidade). null quando `insumo_id` é null. */
  quantidade_padrao: number | null
  /** Quantas porções desta opção o cliente pode pedir de uma vez (ex: "3x Granola").
   * null ou 1 = só dá pra marcar/desmarcar; um valor maior mostra um contador no totem. */
  quantidade_maxima: number | null
}

export interface MenuItemModifier {
  menu_item_id: string
  modifier_id: string
}

/** Ingrediente fixo de um "copo pronto" (ver MenuItem.copo_pronto) — reaproveita
 * um adicional (modifier_options) já cadastrado, só como informação pro cliente. */
export interface MenuItemIngrediente {
  menu_item_id: string
  modifier_option_id: string
  ordem: number
}

export type TipTipo = 'fixo' | 'percentual'

/**
 * Uma opção de gorjeta oferecida no totem. "Sem gorjeta" não está aqui: o
 * cliente sempre pode não deixar nada, e isso não é configurável.
 */
export interface TipOption {
  id: string
  tipo: TipTipo
  /** Francos quando `fixo`; pontos percentuais do subtotal quando `percentual`. */
  valor: number
  ordem: number
  ativo: boolean
}

/** Quanto uma opção vale em francos, dado o subtotal do pedido. */
export function tipAmountFor(option: Pick<TipOption, 'tipo' | 'valor'>, subtotal: number): number {
  const bruto = option.tipo === 'fixo' ? option.valor : (subtotal * option.valor) / 100
  return Math.round(bruto * 100) / 100
}

export interface Order {
  id: string
  status: OrderStatus
  criado_em: string
  atualizado_em: string
  sumup_checkout_id: string | null
  valor_pago: number | null
  nome_cliente: string | null
  gorjeta: number
  /** Como a SumUp reportou o pagamento, em alemão: "Kontaktlos · VISA". "Dinheiro" nos pagamentos em espécie, "Twint" nos pagamentos por Twint. null = pedido antigo ou não informado. */
  forma_pagamento: string | null
  /** Quanto o cliente entregou em espécie. Só preenchido em pedidos pagos em dinheiro; o troco é este valor menos `valor_pago`. */
  valor_recebido_dinheiro: number | null
  /** Instante em que o pagamento foi confirmado (status virou "recebido"). */
  pago_em: string | null
  /** Instante em que o pedido foi entregue. Com `pago_em`, dá o tempo de preparo. */
  entregue_em: string | null
  /** Se os insumos deste pedido já foram baixados do estoque (ver módulo de Fechamento). Não é um status da cozinha. */
  estoque_baixado: boolean
  /** Instante do fechamento. null enquanto `estoque_baixado` for false. */
  baixado_em: string | null
}

/**
 * Pedido como os relatórios enxergam: qualquer status, inclusive os dois que
 * nunca chegam ao quadro da cozinha (`aguardando_pagamento` vira carrinho
 * abandonado e `cancelado` vira falha de pagamento).
 */
export interface ReportOrder extends Omit<Order, 'status'> {
  status: FullOrderStatus
  items: OrderItem[]
}

/** Snapshot de uma opção de modifier escolhida, gravado dentro de order_items.modifiers_selecionados */
export interface SelectedModifierOption {
  modifier_id: string
  modifier_nome: string
  option_id: string
  option_nome: string
  /** Traduções do nome da opção, só para exibição no carrinho — a cozinha sempre vê `option_nome` (alemão). */
  option_nome_i18n: Record<string, string>
  preco_adicional: number
  /** Quantas porções desta opção foram pedidas (ver ModifierOption.quantidade_maxima).
   * Preço, cozinha e baixa de estoque escalam por este número — sempre >= 1. */
  quantidade: number
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string | null
  nome_item: string
  quantidade: number
  observacoes: string | null
  modifiers_selecionados: SelectedModifierOption[]
  preco_unitario: number
  /** Descrição do produto, carimbada no pedido quando `MenuItem.descricao_na_comanda` era true na compra. null = não se aplica a este item. */
  descricao_item: string | null
}

/** Um item completo com seus modifiers disponíveis, montado no App da Mesa */
export interface MenuItemWithModifiers extends MenuItem {
  modifierGroups: ModifierGroup[]
  /** Ingredientes fixos do "copo pronto" (ver MenuItem.copo_pronto), na ordem
   * escolhida no Painel da Equipe. Vazio quando não é um copo pronto. */
  ingredientes: ModifierOption[]
}

export interface ModifierGroup extends Modifier {
  options: ModifierOption[]
}

/** Pedido "achatado" com itens, usado no App da Equipe */
export interface OrderWithItems extends Order {
  items: OrderItem[]
}

// ---------------------------------------------------------------------
// Gestão de estoque — só o Painel da Equipe usa isto (nada aqui é lido
// pelo totem/cardápio público).
// ---------------------------------------------------------------------

export type Unidade = 'kg' | 'g' | 'l' | 'ml' | 'unidade'

export interface Fornecedor {
  id: string
  nome: string
  contato: string | null
  telefone: string | null
  email: string | null
  observacoes: string | null
  /** Desativado em vez de excluído: preserva compras já registradas com este fornecedor. */
  ativo: boolean
  criado_em: string
}

export interface Insumo {
  id: string
  nome: string
  unidade: Unidade
  /** Abaixo deste saldo, o insumo aparece como "saldo baixo" no dashboard de estoque. null = sem alerta. */
  estoque_minimo: number | null
  /** Peso de 1 litro deste insumo, em gramas (ex: açaí puro ≈ 1030). Só faz
   * sentido quando `unidade` é 'l' ou 'ml' — permite compor a receita do
   * produto em gramas mesmo controlando o estoque em volume (ver
   * insumoConversao.ts). null = composição continua na própria unidade. */
  gramas_por_litro: number | null
  /** Desativado em vez de excluído: preserva compras/movimentações/perdas já registradas com este insumo. */
  ativo: boolean
  ordem: number
  criado_em: string
}

/** Linha da composição/receita fixa de um produto (ex: Açaí 500ml = 400g de açaí + 1 copo + 1 colher). */
export interface MenuItemInsumo {
  menu_item_id: string
  insumo_id: string
  quantidade: number
}

export type ImpostoTipo = 'fixo' | 'percentual'

/**
 * Um imposto cadastrado — opcionalmente vinculado a um insumo específico
 * (ex: taxa de importação do açaí). Quando vinculado, entra no cálculo do
 * custo de uma compra desse insumo (ver valorUnitarioComImposto). Sem
 * vínculo (insumo_id null), é só um registro genérico.
 */
export interface Imposto {
  id: string
  nome: string
  tipo: ImpostoTipo
  /** Francos quando `fixo` (por unidade); pontos percentuais quando `percentual`. */
  valor: number
  insumo_id: string | null
  ativo: boolean
  criado_em: string
}

export type PedidoCompraStatus = 'rascunho' | 'aguardando_recebimento' | 'recebido' | 'cancelado'

export interface PedidoCompra {
  id: string
  fornecedor_id: string
  status: PedidoCompraStatus
  observacoes: string | null
  criado_em: string
  recebido_em: string | null
}

export interface PedidoCompraItem {
  id: string
  pedido_compra_id: string
  insumo_id: string
  quantidade: number
  valor_unitario: number | null
}

export interface PedidoCompraWithItens extends PedidoCompra {
  itens: PedidoCompraItem[]
}

export type MovimentacaoTipo =
  | 'entrada_compra'
  | 'entrada_manual'
  | 'entrada_ajuste_inventario'
  | 'saida_manual'
  | 'saida_ajuste_inventario'
  | 'saida_venda'
  | 'saida_perda'

/** Uma linha da trilha de estoque — imutável depois de gravada (ver RLS em schema.sql). */
export interface MovimentacaoEstoque {
  id: string
  insumo_id: string
  /** Assinada: positiva numa entrada, negativa numa saída — a soma dá o saldo (ver view `insumo_saldos`). */
  quantidade: number
  tipo: MovimentacaoTipo
  /** O que gerou o movimento (referência solta, não FK): 'pedido_compra' | 'order' | 'inventario' | 'perda' | null (lançamento manual). */
  origem_tipo: string | null
  origem_id: string | null
  observacoes: string | null
  criado_em: string
  criado_por: string | null
}

export const MOVIMENTACAO_TIPO_LABEL: Record<MovimentacaoTipo, string> = {
  entrada_compra: 'Compra recebida',
  entrada_manual: 'Entrada manual',
  entrada_ajuste_inventario: 'Ajuste de inventário (entrada)',
  saida_manual: 'Saída manual',
  saida_ajuste_inventario: 'Ajuste de inventário (saída)',
  saida_venda: 'Baixa por venda',
  saida_perda: 'Perda',
}

export type MotivoPerda =
  | 'desperdicio'
  | 'perda'
  | 'produto_danificado'
  | 'produto_vencido'
  | 'erro_operacional'
  | 'falta_de_controle'
  | 'outros'

export const MOTIVO_PERDA_LABEL: Record<MotivoPerda, string> = {
  desperdicio: 'Desperdício',
  perda: 'Perda',
  produto_danificado: 'Produto danificado',
  produto_vencido: 'Produto vencido',
  erro_operacional: 'Erro operacional',
  falta_de_controle: 'Falta de controle',
  outros: 'Outros',
}

/** Uma sessão de contagem física: nasce e termina no mesmo lançamento (sem rascunho). */
export interface Inventario {
  id: string
  observacoes: string | null
  criado_em: string
  finalizado_em: string | null
  criado_por: string | null
}

export interface InventarioItem {
  id: string
  inventario_id: string
  insumo_id: string
  /** Saldo no instante da contagem — congelado, não recalculado depois. */
  saldo_sistema: number
  saldo_contado: number
  /** Só preenchido quando saldo_contado < saldo_sistema (faltou estoque). */
  motivo: MotivoPerda | null
}

export interface InventarioWithItens extends Inventario {
  itens: InventarioItem[]
}

/**
 * Uma perda registrada. Quando `origem_tipo` é 'inventario', é só
 * categorização de uma diferença já ajustada no estoque; quando é
 * 'manual', ela mesma dispara a movimentação que tira o insumo do saldo
 * (ver useEstoquePerdas.lancarPerdaManual).
 */
export interface Perda {
  id: string
  insumo_id: string
  quantidade: number
  motivo: MotivoPerda
  observacoes: string | null
  origem_tipo: 'manual' | 'inventario'
  origem_id: string | null
  criado_em: string
  criado_por: string | null
}
