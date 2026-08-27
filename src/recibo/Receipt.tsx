import { useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import { formatCHF } from '@shared/format'
import { isPaidStatus } from '@shared/types'
import type { OrderItem, ReportOrder } from '@shared/types'
import { RECEIPT_STRINGS } from './strings'
import type { LanguageCode } from '../mesa/i18n/languages'

const IDIOMAS: LanguageCode[] = ['de', 'fr', 'it', 'en', 'pt', 'es']

function lerParametros() {
  const params = new URLSearchParams(window.location.search)
  const lang = params.get('lang') as LanguageCode | null
  return {
    orderId: params.get('pedido'),
    lang: lang && IDIOMAS.includes(lang) ? lang : 'de',
  }
}

interface Carregado {
  order: ReportOrder
}

/**
 * Só a bandeira do cartão, do que a SumUp reportou.
 *
 * `forma_pagamento` é gravada em alemão — "Kontaktlos · VISA" — e este
 * comprovante é lido em seis idiomas. A bandeira é a metade que não tem
 * idioma nenhum, e é também a única que importa num recibo: se foi por
 * aproximação ou por chip não muda nada para quem levou o açaí. Sem bandeira,
 * a linha inteira sai.
 */
function cardBrand(formaPagamento: string | null): string | null {
  if (!formaPagamento) return null
  const partes = formaPagamento.split('·').map((p) => p.trim())
  return partes.length > 1 ? partes[partes.length - 1] : null
}

export default function Receipt() {
  const { orderId, lang } = lerParametros()
  const t = RECEIPT_STRINGS[lang]
  const [estado, setEstado] = useState<'carregando' | 'ausente' | 'naoPago' | Carregado>('carregando')

  useEffect(() => {
    if (!orderId) {
      setEstado('ausente')
      return
    }
    let vivo = true
    ;(async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', orderId)
        .maybeSingle()
      if (!vivo) return
      if (!data) return setEstado('ausente')

      const { order_items, ...order } = data as ReportOrder & { order_items?: OrderItem[] }
      const completo = { ...order, items: order_items ?? [] } as ReportOrder
      // Um pedido que ficou no caminho não tem comprovante para dar. Sem esta
      // guarda, um carrinho abandonado renderizaria um recibo de algo que
      // ninguém pagou.
      setEstado(isPaidStatus(completo.status) ? { order: completo } : 'naoPago')
    })()
    return () => {
      vivo = false
    }
  }, [orderId])

  if (estado === 'carregando') return <p className="receipt__status">{t.loading}</p>
  if (estado === 'ausente') return <p className="receipt__status">{t.notFound}</p>
  if (estado === 'naoPago') return <p className="receipt__status">{t.notPaid}</p>

  const { order } = estado
  const gorjeta = Number(order.gorjeta ?? 0)
  const total = Number(order.valor_pago ?? 0)
  const subtotal = total - gorjeta
  const quando = new Date(order.pago_em ?? order.criado_em)

  return (
    <article className="receipt">
      <header className="receipt__head">
        <img src="/brand/logo.png" alt="" className="receipt__logo" />
        <h1>Forest Açaí</h1>
        <p className="receipt__meta">
          {t.title} · {quando.toLocaleDateString(lang)} {quando.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}
        </p>
      </header>

      {order.nome_cliente && (
        <p className="receipt__customer">
          <span>{t.orderName}</span>
          <strong>{order.nome_cliente}</strong>
        </p>
      )}

      <h2 className="receipt__section">{t.items}</h2>
      <ul className="receipt__items">
        {order.items.map((item) => (
          <li key={item.id} className="receipt__item">
            <div className="receipt__item-head">
              <span className="receipt__item-qty">{item.quantidade}×</span>
              <span className="receipt__item-name">{item.nome_item}</span>
              <span className="receipt__item-price">
                {formatCHF(Number(item.preco_unitario) * item.quantidade)}
              </span>
            </div>
            {item.modifiers_selecionados.length > 0 && (
              <p className="receipt__item-mods">
                {item.modifiers_selecionados.map((o) => o.option_nome).join(' · ')}
              </p>
            )}
            {item.observacoes && <p className="receipt__item-note">{item.observacoes}</p>}
          </li>
        ))}
      </ul>

      <dl className="receipt__totals">
        <div>
          <dt>{t.subtotal}</dt>
          <dd>{formatCHF(subtotal)}</dd>
        </div>
        {gorjeta > 0 && (
          <div>
            <dt>{t.tip}</dt>
            <dd>{formatCHF(gorjeta)}</dd>
          </div>
        )}
        <div className="receipt__totals-grand">
          <dt>{t.total}</dt>
          <dd>{formatCHF(total)}</dd>
        </div>
      </dl>

      <footer className="receipt__foot">
        {cardBrand(order.forma_pagamento) && (
          <p>
            {t.paidWith} {cardBrand(order.forma_pagamento)}
          </p>
        )}
        <p className="receipt__ref">
          {t.orderRef} {order.id.slice(0, 8).toUpperCase()}
        </p>
      </footer>
    </article>
  )
}
