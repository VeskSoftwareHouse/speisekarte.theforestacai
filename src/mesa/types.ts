import type { MenuItemWithModifiers, SelectedModifierOption } from '@shared/types'

export interface CartItem {
  cartId: string
  menuItem: MenuItemWithModifiers
  quantidade: number
  observacoes: string
  selectedOptions: SelectedModifierOption[]
  unitPrice: number
}

export function cartItemTotal(item: CartItem): number {
  return item.unitPrice * item.quantidade
}
