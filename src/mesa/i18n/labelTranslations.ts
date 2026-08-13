import type { LanguageCode } from './languages'

type NonGermanCode = Exclude<LanguageCode, 'de'>

/**
 * Traduções de categorias, grupos de modifier e opções, por nome alemão
 * (o texto gravado no banco — ver supabase/seed.sql). Não há UUID estável
 * para modifier_options (são gerados de novo a cada reseed), então usamos
 * o texto como chave em todo lugar, por consistência.
 *
 * Nomes que já são internacionais/marcas (Toppings, Oreo, Nutella, Kiwi,
 * Tapioka, Granola…) não precisam de entrada — o fallback já devolve o
 * próprio texto alemão, que é igual nos outros idiomas.
 */
const LABELS: Record<string, Partial<Record<NonGermanCode, string>>> = {
  // categorias
  'Açaí im Becher': {
    fr: 'Açaí en bol',
    it: 'Açaí in coppa',
    en: 'Açaí Bowls',
    pt: 'Açaí na Tigela',
    es: 'Açaí en Bol',
  },
  Kombos: {
    fr: 'Formules',
    it: 'Combo',
    en: 'Combos',
    pt: 'Combos',
    es: 'Combos',
  },
  'Säfte — Klassiker': {
    fr: 'Jus — Classiques',
    it: 'Succhi — Classici',
    en: 'Juices — Classics',
    pt: 'Sucos — Clássicos',
    es: 'Zumos — Clásicos',
  },
  'Säfte — Exotisch': {
    fr: 'Jus — Exotiques',
    it: 'Succhi — Esotici',
    en: 'Juices — Exotic',
    pt: 'Sucos — Exóticos',
    es: 'Zumos — Exóticos',
  },
  'Säfte — Premium': {
    fr: 'Jus — Premium',
    it: 'Succhi — Premium',
    en: 'Juices — Premium',
    pt: 'Sucos — Premium',
    es: 'Zumos — Premium',
  },

  // grupos de modifier
  Früchte: {
    fr: 'Fruits',
    it: 'Frutta',
    en: 'Fruits',
    pt: 'Frutas',
    es: 'Frutas',
  },
  Grösse: {
    fr: 'Taille',
    it: 'Formato',
    en: 'Size',
    pt: 'Tamanho',
    es: 'Tamaño',
  },

  // opções
  Erdbeere: {
    fr: 'Fraise',
    it: 'Fragola',
    en: 'Strawberry',
    pt: 'Morango',
    es: 'Fresa',
  },
  Blaubeere: {
    fr: 'Myrtille',
    it: 'Mirtillo',
    en: 'Blueberry',
    pt: 'Mirtilo',
    es: 'Arándano',
  },
  Banane: {
    fr: 'Banane',
    it: 'Banana',
    en: 'Banana',
    pt: 'Banana',
    es: 'Plátano',
  },
  Milchpulver: {
    fr: 'Poudre de lait',
    it: 'Latte in polvere',
    en: 'Milk powder',
    pt: 'Leite em pó',
    es: 'Leche en polvo',
  },
  Erdnüsse: {
    fr: 'Cacahuètes',
    it: 'Arachidi',
    en: 'Peanuts',
    pt: 'Amendoim',
    es: 'Cacahuete',
  },
  Kondensmilch: {
    fr: 'Lait concentré',
    it: 'Latte condensato',
    en: 'Condensed milk',
    pt: 'Leite condensado',
    es: 'Leche condensada',
  },
}

export function translateLabel(germanText: string, lang: LanguageCode): string {
  if (lang === 'de') return germanText
  return LABELS[germanText]?.[lang] ?? germanText
}
