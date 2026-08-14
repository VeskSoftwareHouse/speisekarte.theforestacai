import { Soup, Gift, CupSoda, Citrus, Sparkles, Grape, Flame, type LucideIcon } from 'lucide-react'

const CATEGORY_ICON: Record<string, LucideIcon> = {
  'Açaí im Becher': Soup,
  Kombos: Gift,
  'Säfte Klassiker': CupSoda,
  'Säfte Exotisch': Citrus,
  'Säfte Premium': Sparkles,
}

export function iconFor(nome: string): LucideIcon {
  return CATEGORY_ICON[nome] ?? Grape
}

export const FeaturedIcon = Flame
export const FallbackPhotoIcon = Grape
