import { useEffect, useState } from 'react'
import { supabase } from '@shared/supabaseClient'
import type { RestaurantTable } from '@shared/types'
import TableSelect from './components/TableSelect'
import MenuScreen from './components/MenuScreen'
import CartScreen from './components/CartScreen'
import ConfirmationScreen from './components/ConfirmationScreen'
import { useKeepFullscreen } from './useFullscreen'
import type { CartItem } from './types'
import { cartItemTotal } from './types'

type View = 'menu' | 'cart' | 'confirmation'

const STORAGE_KEY = 'cardapio:table'

export default function App() {
  const [table, setTable] = useState<RestaurantTable | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as RestaurantTable) : null
  })
  const [view, setView] = useState<View>('menu')
  const [cart, setCart] = useState<CartItem[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useKeepFullscreen()

  useEffect(() => {
    if (table) localStorage.setItem(STORAGE_KEY, JSON.stringify(table))
  }, [table])

  function handleSelectTable(t: RestaurantTable) {
    setTable(t)
    setView('menu')
  }

  function handleChangeTable() {
    localStorage.removeItem(STORAGE_KEY)
    setTable(null)
    setCart([])
  }

  function handleAddToCart(item: CartItem) {
    setCart((prev) => [...prev, item])
  }

  function handleChangeQuantity(cartId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.cartId === cartId ? { ...i, quantidade: i.quantidade + delta } : i))
        .filter((i) => i.quantidade > 0),
    )
  }

  function handleRemove(cartId: string) {
    setCart((prev) => prev.filter((i) => i.cartId !== cartId))
  }

  async function handleSubmit() {
    if (!table || cart.length === 0) return
    setSending(true)
    setSendError(null)

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({ table_id: table.id, status: 'recebido' })
      .select()
      .single()

    if (orderError || !order) {
      setSendError(orderError?.message ?? 'Não foi possível criar o pedido.')
      setSending(false)
      return
    }

    const orderItemsPayload = cart.map((item) => ({
      order_id: order.id,
      menu_item_id: item.menuItem.id,
      nome_item: item.menuItem.nome,
      quantidade: item.quantidade,
      observacoes: item.observacoes || null,
      modifiers_selecionados: item.selectedOptions,
      preco_unitario: item.unitPrice,
    }))

    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload)

    if (itemsError) {
      setSendError(itemsError.message)
      setSending(false)
      return
    }

    setSending(false)
    setCart([])
    setView('confirmation')
  }

  if (!table) {
    return <TableSelect onSelect={handleSelectTable} />
  }

  const cartCount = cart.reduce((sum, i) => sum + i.quantidade, 0)
  const cartTotal = cart.reduce((sum, i) => sum + cartItemTotal(i), 0)

  if (view === 'confirmation') {
    return (
      <ConfirmationScreen
        tableNumero={table.numero}
        onNewOrder={() => {
          setView('menu')
        }}
      />
    )
  }

  if (view === 'cart') {
    return (
      <>
        <CartScreen
          items={cart}
          sending={sending}
          onBack={() => setView('menu')}
          onChangeQuantity={handleChangeQuantity}
          onRemove={handleRemove}
          onSubmit={handleSubmit}
        />
        {sendError && (
          <div className="toast toast--error" role="alert">
            {sendError}
          </div>
        )}
      </>
    )
  }

  return (
    <MenuScreen
      table={table}
      cartCount={cartCount}
      cartTotal={cartTotal}
      onAddToCart={handleAddToCart}
      onOpenCart={() => setView('cart')}
      onChangeTable={handleChangeTable}
    />
  )
}
