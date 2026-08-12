import type { LanguageCode } from './languages'

type NonGermanCode = Exclude<LanguageCode, 'de'>

/** Traduções da descrição de cada item, por UUID (mesmo id usado no supabase/seed.sql). */
const MENU_DESCRIPTIONS: Record<string, Partial<Record<NonGermanCode, string>>> = {
  // Açaí 300 ml
  '00000000-0000-0000-0000-0000000000e1': {
    fr: "Composez votre açaí — choisissez jusqu'à 4 ingrédients (fruits et garnitures).",
    it: 'Componi il tuo açaí — scegli fino a 4 ingredienti (frutta e topping).',
    en: 'Build your own açaí — choose up to 4 ingredients (fruits & toppings).',
    pt: 'Monte seu açaí — escolha até 4 ingredientes (frutas e coberturas).',
    es: 'Arma tu açaí — elige hasta 4 ingredientes (frutas y toppings).',
  },
  // Açaí 500 ml
  '00000000-0000-0000-0000-0000000000e2': {
    fr: "Composez votre açaí — choisissez jusqu'à 5 ingrédients (fruits et garnitures).",
    it: 'Componi il tuo açaí — scegli fino a 5 ingredienti (frutta e topping).',
    en: 'Build your own açaí — choose up to 5 ingredients (fruits & toppings).',
    pt: 'Monte seu açaí — escolha até 5 ingredientes (frutas e coberturas).',
    es: 'Arma tu açaí — elige hasta 5 ingredientes (frutas y toppings).',
  },
  // Forest Individual
  '00000000-0000-0000-0000-0000000000e3': {
    fr: '1 açaí 500 ml + 1 jus 300 ml.',
    it: '1 açaí 500 ml + 1 succo 300 ml.',
    en: '1 açaí 500 ml + 1 juice 300 ml.',
    pt: '1 açaí 500 ml + 1 suco 300 ml.',
    es: '1 açaí 500 ml + 1 zumo 300 ml.',
  },
  // Couple
  '00000000-0000-0000-0000-0000000000e4': {
    fr: 'Deux açaís 500 ml — parfait à partager à deux.',
    it: 'Due açaí da 500 ml — perfetti da condividere in due.',
    en: 'Two açaí bowls 500 ml — perfect to share as a couple.',
    pt: '2 açaís 500 ml — perfeito para compartilhar a dois.',
    es: 'Dos açaís 500 ml — perfecto para compartir en pareja.',
  },
  // Family
  '00000000-0000-0000-0000-0000000000e5': {
    fr: '2 açaís 500 ml + 2 jus 500 ml — pour toute la famille.',
    it: '2 açaí da 500 ml + 2 succhi da 500 ml — per tutta la famiglia.',
    en: '2 açaí bowls 500 ml + 2 juices 500 ml — for the whole family.',
    pt: '2 açaís 500 ml + 2 sucos 500 ml — para toda a família.',
    es: '2 açaís 500 ml + 2 zumos 500 ml — para toda la familia.',
  },
  // Ananas
  '00000000-0000-0000-0000-0000000000e6': {
    fr: "Jus d'ananas fraîchement pressé.",
    it: 'Succo di ananas appena spremuto.',
    en: 'Freshly squeezed pineapple juice.',
    pt: 'Suco de abacaxi espremido na hora.',
    es: 'Zumo de piña recién exprimido.',
  },
  // Mango
  '00000000-0000-0000-0000-0000000000e7': {
    fr: 'Jus de mangue crémeux, 100% fruit.',
    it: 'Succo di mango cremoso, 100% frutta.',
    en: 'Creamy mango juice, 100% fruit.',
    pt: 'Suco cremoso de manga, 100% fruta.',
    es: 'Zumo cremoso de mango, 100% fruta.',
  },
  // Goiaba
  '00000000-0000-0000-0000-0000000000e8': {
    fr: 'Jus de goyave rafraîchissant.',
    it: 'Succo di guava rinfrescante.',
    en: 'Refreshing guava juice.',
    pt: 'Suco refrescante de goiaba.',
    es: 'Zumo refrescante de guayaba.',
  },
  // Acerola
  '00000000-0000-0000-0000-0000000000e9': {
    fr: "Jus d'acérola riche en vitamine C.",
    it: 'Succo di acerola ricco di vitamina C.',
    en: 'Vitamin C-rich acerola juice.',
    pt: 'Suco de acerola rico em vitamina C.',
    es: 'Zumo de acerola rico en vitamina C.',
  },
  // Cupuaçu
  '00000000-0000-0000-0000-0000000000ea': {
    fr: 'Jus crémeux de cupuaçu amazonien.',
    it: 'Succo cremoso di cupuaçu amazzonico.',
    en: 'Creamy Amazonian cupuaçu juice.',
    pt: 'Suco cremoso de cupuaçu amazônico.',
    es: 'Zumo cremoso de cupuaçu amazónico.',
  },
  // Caju
  '00000000-0000-0000-0000-0000000000eb': {
    fr: 'Jus de cajou brésilien fruité.',
    it: 'Succo di anacardio brasiliano fruttato.',
    en: 'Fruity Brazilian cashew juice.',
    pt: 'Suco frutado de caju brasileiro.',
    es: 'Zumo afrutado de anacardo brasileño.',
  },
  // Cajá
  '00000000-0000-0000-0000-0000000000ec': {
    fr: 'Jus exotique de cajá.',
    it: 'Succo esotico di cajá.',
    en: 'Exotic cajá fruit juice.',
    pt: 'Suco exótico de cajá.',
    es: 'Zumo exótico de cajá.',
  },
  // Graviola
  '00000000-0000-0000-0000-0000000000ed': {
    fr: 'Jus crémeux de graviola (corossol).',
    it: 'Succo cremoso di graviola (guanabana).',
    en: 'Creamy soursop (graviola) juice.',
    pt: 'Suco cremoso de graviola.',
    es: 'Zumo cremoso de graviola (guanábana).',
  },
  // Maracujá
  '00000000-0000-0000-0000-0000000000ee': {
    fr: 'Jus de fruit de la passion aigre-doux.',
    it: 'Succo di frutto della passione agrodolce.',
    en: 'Sweet and tangy passion fruit juice.',
    pt: 'Suco agridoce de maracujá.',
    es: 'Zumo agridulce de maracuyá.',
  },
  // Waldbeeren
  '00000000-0000-0000-0000-0000000000ef': {
    fr: 'Jus de baies sauvages riche en antioxydants.',
    it: 'Succo di frutti di bosco ricco di antiossidanti.',
    en: 'Antioxidant-rich wild berry juice.',
    pt: 'Suco de frutas silvestres rico em antioxidantes.',
    es: 'Zumo de frutos del bosque rico en antioxidantes.',
  },
}

/** Descrição do item no idioma escolhido; alemão (o do banco) é sempre o fallback. */
export function translatedDescription(
  itemId: string,
  lang: LanguageCode,
  fallback: string | null,
): string | null {
  if (lang === 'de') return fallback
  return MENU_DESCRIPTIONS[itemId]?.[lang] ?? fallback
}
