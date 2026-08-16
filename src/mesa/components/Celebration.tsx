import { useMemo, type CSSProperties } from 'react'

const PIECES = 30

// Bagas de açaí e penas de tucano, nas cores da marca — confete genérico não
// teria nada a ver com a casa.
const BERRY_COLORS = ['#4a26b0', '#6c3ce6', '#340261', '#8a5cf0']
const FEATHER_COLORS = ['#f5a300', '#e9c874', '#f97316', '#ffffff']

interface Piece {
  kind: 'berry' | 'feather'
  style: CSSProperties
}

/**
 * Chuva comemorativa da tela de pedido enviado. As peças são sorteadas uma vez,
 * na montagem, e cada uma leva o próprio ângulo, alcance e giro em variáveis CSS
 * — a animação em si é toda do navegador, sem quadro a quadro em JavaScript.
 */
export default function Celebration() {
  const pieces = useMemo<Piece[]>(() => {
    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    return Array.from({ length: PIECES }, (_, i) => {
      const berry = i % 5 !== 0 // mais bagas que penas
      const angle = rand(-100, -80) + rand(-70, 70)
      const distance = rand(180, 460)
      const size = berry ? rand(9, 16) : rand(10, 20)
      const palette = berry ? BERRY_COLORS : FEATHER_COLORS
      return {
        kind: berry ? 'berry' : 'feather',
        style: {
          '--angle': `${angle}deg`,
          '--distance': `${distance}px`,
          '--spin': `${rand(-540, 540)}deg`,
          '--drift': `${rand(-60, 60)}px`,
          '--delay': `${rand(0, 260)}ms`,
          '--duration': `${rand(1100, 1900)}ms`,
          width: `${size}px`,
          height: berry ? `${size}px` : `${size * 2.1}px`,
          background: palette[i % palette.length],
        } as CSSProperties,
      }
    })
  }, [])

  return (
    <div className="celebration" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className={`celebration__piece celebration__piece--${p.kind}`} style={p.style} />
      ))}
    </div>
  )
}
