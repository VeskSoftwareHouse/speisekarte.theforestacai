import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FallbackPhotoIcon } from '../categoryIcons'

// Precisa bater com a duração de .fly-item no mesa.css.
const FLIGHT_MS = 620
const FLIGHT_SIZE = 88

interface Flight {
  id: string
  photo: string | null
  style: CSSProperties
}

/**
 * Ao adicionar um produto, uma cópia da foto sai do card e faz um arco até o
 * carrinho. Além da graça, resolve um problema real: hoje o toque adiciona o
 * item em silêncio, sem nada ligando o produto ao painel do pedido.
 *
 * O alvo é procurado na hora porque ele muda com a largura da tela — no celular
 * é o botão flutuante, no desktop é o cabeçalho do painel. Vale o primeiro que
 * estiver realmente na tela.
 */
export function useFlyToCart(): { launch: (from: Element | null, photo: string | null) => void; layer: ReactNode } {
  const [flights, setFlights] = useState<Flight[]>([])

  const launch = useCallback((from: Element | null, photo: string | null) => {
    if (!from) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const source = from.getBoundingClientRect()
    if (source.width === 0 || source.height === 0) return

    let target: DOMRect | null = null
    for (const selector of ['.cart-fab', '.cart-panel__header']) {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      if (rect && rect.width > 0 && rect.height > 0) {
        target = rect
        break
      }
    }
    if (!target) return

    const id = crypto.randomUUID()
    const fromX = source.left + source.width / 2
    const fromY = source.top + source.height / 2
    setFlights((list) => [
      ...list,
      {
        id,
        photo,
        style: {
          left: fromX - FLIGHT_SIZE / 2,
          top: fromY - FLIGHT_SIZE / 2,
          width: FLIGHT_SIZE,
          height: FLIGHT_SIZE,
          '--fly-dx': `${target.left + target.width / 2 - fromX}px`,
          '--fly-dy': `${target.top + target.height / 2 - fromY}px`,
        } as CSSProperties,
      },
    ])
    window.setTimeout(() => setFlights((list) => list.filter((f) => f.id !== id)), FLIGHT_MS)
  }, [])

  const layer = createPortal(
    <div className="fly-layer" aria-hidden>
      {flights.map((f) => (
        <div key={f.id} className="fly-item" style={f.style}>
          <div className="fly-item__inner">
            {f.photo ? (
              <img src={f.photo} alt="" />
            ) : (
              <FallbackPhotoIcon className="fly-item__fallback" size={34} strokeWidth={1.5} />
            )}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  )

  return { launch, layer }
}
