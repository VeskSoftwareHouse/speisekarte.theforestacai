import { useEffect, useState } from 'react'

// Precisa bater com a duração de .logo-bird--hop no mesa.css.
const HOP_MS = 800

interface Props {
  /** Rótulo da imagem de base. Vazio quando a logo é puro enfeite. */
  alt?: string
  /** Tocar no pássaro faz ele pular. Desligado onde o toque tem outro dono. */
  interactive?: boolean
}

/**
 * O tucano da marca, montado em camadas para poder se mexer: a base traz a arte
 * com a asa e a mandíbula substituídas por preenchimento escuro, e essas duas
 * peças voltam por cima como imagens próprias (ver scripts/split-logo.mjs).
 * O brilho usa o próprio PNG como máscara e a pálpebra fica sobre o olho.
 *
 * Tudo é posicionado em % da imagem, então o mesmo componente serve à logo
 * pequena da sidebar e à grande do descanso de tela.
 */
export default function AnimatedLogo({ alt = '', interactive = true }: Props) {
  const [hopping, setHopping] = useState(false)

  // O fim do pulo vem de um timer, e não de onAnimationEnd: com a aba em segundo
  // plano o evento pode nunca chegar e o tucano ficaria parado no meio do salto.
  useEffect(() => {
    if (!hopping) return
    const id = window.setTimeout(() => setHopping(false), HOP_MS)
    return () => window.clearTimeout(id)
  }, [hopping])

  return (
    <div
      className={`logo-bird ${hopping ? 'logo-bird--hop' : ''}`}
      onClick={interactive ? () => setHopping(true) : undefined}
    >
      <img src="/brand/logo-base.png" alt={alt} className="logo-bird__base" />
      <img src="/brand/logo-wing.png" alt="" aria-hidden className="logo-bird__wing" />
      <img src="/brand/logo-beak.png" alt="" aria-hidden className="logo-bird__beak" />
      <span className="logo-bird__glint" aria-hidden />
      <span className="logo-bird__eyelid" aria-hidden />
    </div>
  )
}
