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
  /** Traduções manuais do nome por idioma (chaves: fr, it, en, pt, es). Alemão vem de `nome`. */
  nome_i18n: Record<string, string>
}

export interface ModifierOption {
  id: string
  modifier_id: string
  nome: string
  preco_adicional: number
  ordem: number
  /** Traduções manuais do nome por idioma (chaves: fr, it, en, pt, es). Alemão vem de `nome`. */
  nome_i18n: Record<string, string>
}

export interface MenuItemModifier {
  menu_item_id: string
  modifier_id: string
}

export interface RestaurantTable {
  id: string
  numero: string
}

export interface Order {
  id: string
  table_id: string
  status: OrderStatus
  criado_em: string
  atualizado_em: string
  sumup_checkout_id: string | null
  valor_pago: number | null
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
  table: RestaurantTable | null
  items: OrderItem[]
}
