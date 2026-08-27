import type { LanguageCode } from '../mesa/i18n/languages'

/**
 * Textos do comprovante. Dicionário próprio, e não o do totem: são seis
 * rótulos que só existem aqui, e puxar o dicionário inteiro do cardápio para
 * uma página que abre no 4G do cliente sairia caro por nada.
 */
interface ReceiptStrings {
  title: string
  orderName: string
  items: string
  subtotal: string
  tip: string
  total: string
  paidWith: string
  orderRef: string
  loading: string
  notFound: string
  notPaid: string
}

export const RECEIPT_STRINGS: Record<LanguageCode, ReceiptStrings> = {
  de: {
    title: 'Beleg',
    orderName: 'Bestellung auf den Namen',
    items: 'Artikel',
    subtotal: 'Zwischensumme',
    tip: 'Trinkgeld',
    total: 'Gesamt',
    paidWith: 'Bezahlt mit',
    orderRef: 'Bestellnummer',
    loading: 'Beleg wird geladen…',
    notFound: 'Beleg nicht gefunden.',
    notPaid: 'Diese Bestellung wurde noch nicht bezahlt.',
  },
  fr: {
    title: 'Reçu',
    orderName: 'Commande au nom de',
    items: 'Articles',
    subtotal: 'Sous-total',
    tip: 'Pourboire',
    total: 'Total',
    paidWith: 'Payé par',
    orderRef: 'N° de commande',
    loading: 'Chargement du reçu…',
    notFound: 'Reçu introuvable.',
    notPaid: "Cette commande n'a pas encore été payée.",
  },
  it: {
    title: 'Ricevuta',
    orderName: 'Ordine a nome di',
    items: 'Articoli',
    subtotal: 'Subtotale',
    tip: 'Mancia',
    total: 'Totale',
    paidWith: 'Pagato con',
    orderRef: 'N. ordine',
    loading: 'Caricamento della ricevuta…',
    notFound: 'Ricevuta non trovata.',
    notPaid: 'Questo ordine non è ancora stato pagato.',
  },
  en: {
    title: 'Receipt',
    orderName: 'Order for',
    items: 'Items',
    subtotal: 'Subtotal',
    tip: 'Tip',
    total: 'Total',
    paidWith: 'Paid with',
    orderRef: 'Order number',
    loading: 'Loading receipt…',
    notFound: 'Receipt not found.',
    notPaid: 'This order has not been paid yet.',
  },
  pt: {
    title: 'Comprovante',
    orderName: 'Pedido em nome de',
    items: 'Itens',
    subtotal: 'Subtotal',
    tip: 'Gorjeta',
    total: 'Total',
    paidWith: 'Pago com',
    orderRef: 'Número do pedido',
    loading: 'Carregando o comprovante…',
    notFound: 'Comprovante não encontrado.',
    notPaid: 'Este pedido ainda não foi pago.',
  },
  es: {
    title: 'Comprobante',
    orderName: 'Pedido a nombre de',
    items: 'Artículos',
    subtotal: 'Subtotal',
    tip: 'Propina',
    total: 'Total',
    paidWith: 'Pagado con',
    orderRef: 'Número de pedido',
    loading: 'Cargando el comprobante…',
    notFound: 'Comprobante no encontrado.',
    notPaid: 'Este pedido aún no ha sido pagado.',
  },
}
