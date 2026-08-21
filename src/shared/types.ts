export type ModifierTipo = 'obrigatorio' | 'opcional'
export type ModifierSelecao = 'unica' | 'multipla'
/** Status visíveis no quadro da cozinha (Painel da Equipe). */
export type OrderStatus = 'recebido' | 'em_preparo' | 'pronto' | 'entregue'
/** Status completo, incluindo os dois estados de pagamento que nunca chegam ao quadro da cozinha. */
export type FullOrderStatus = 'aguardando_pagamento' | OrderStatus | 'cancelado'

export const ORDER_STATUS_FLOW: OrderStatus[] = ['recebido', 'em_preparo', 'pronto', 'entregue']

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
}

export interface MenuItemModifier {
  menu_item_id: string
  modifier_id: string
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
  /** Como a SumUp reportou o pagamento, ex: "Cartão sem contato · VISA". null = pedido antigo ou não informado. */
  forma_pagamento: string | null
  /** Instante em que o pagamento foi confirmado (status virou "recebido"). */
  pago_em: string | null
  /** Instante em que o pedido foi entregue. Com `pago_em`, dá o tempo de preparo. */
  entregue_em: string | null
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
}

/** Um item completo com seus modifiers disponíveis, montado no App da Mesa */
export interface MenuItemWithModifiers extends MenuItem {
  modifierGroups: ModifierGroup[]
}

export interface ModifierGroup extends Modifier {
  options: ModifierOption[]
}

/** Pedido "achatado" com itens, usado no App da Equipe */
export interface OrderWithItems extends Order {
  items: OrderItem[]
}
