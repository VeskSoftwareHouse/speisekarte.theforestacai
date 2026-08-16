import { Soup, Gift, CupSoda, Citrus, Sparkles, Grape, Flame, type LucideIcon } from 'lucide-react'

// Cada ícone da sidebar ganha um movimento com a cara do que ele representa: a
// chama tremula, o presente chacoalha, o copo balança. O nome vira a classe
// sidebar__item-icon--<motion>, definida no mesa.css. Ícone e movimento moram
// no mesmo registro justamente para não descolarem um do outro.
export type IconMotion = 'flame' | 'bowl' | 'gift' | 'cup' | 'citrus' | 'sparkle' | 'grape'

interface CategoryIcon {
  icon: LucideIcon
  motion: IconMotion
}

const CATEGORY_ICON: Record<string, CategoryIcon> = {
  'Açaí im Becher': { icon: Soup, motion: 'bowl' },
  Kombos: { icon: Gift, motion: 'gift' },
  'Säfte Klassiker': { icon: CupSoda, motion: 'cup' },
  'Säfte Exotisch': { icon: Citrus, motion: 'citrus' },
  'Säfte Premium': { icon: Sparkles, motion: 'sparkle' },
}

const FALLBACK: CategoryIcon = { icon: Grape, motion: 'grape' }

export function iconFor(nome: string): LucideIcon {
  return (CATEGORY_ICON[nome] ?? FALLBACK).icon
}

export function motionFor(nome: string): IconMotion {
  return (CATEGORY_ICON[nome] ?? FALLBACK).motion
}

export const FeaturedIcon = Flame
export const FEATURED_MOTION: IconMotion = 'flame'
export const FallbackPhotoIcon = Grape
