import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

interface Props {
  /** Endereço que o celular do cliente vai abrir. */
  url: string
  /** Lado do desenho em pixels. O QR é vetorial: escala sem borrar. */
  size?: number
}

/**
 * QR desenhado como SVG, não como imagem.
 *
 * O totem tem de funcionar mesmo com a internet oscilando, então o código é
 * gerado no próprio tablet — nada de pedir a imagem a um serviço de QR, que
 * numa queda de rede deixaria o cliente sem comprovante justo depois de pagar.
 *
 * Correção de erro no nível médio: recupera cerca de 15% do desenho, o que dá
 * conta de reflexo de luz e do dedo de quem aponta a câmera torto.
 */
export default function ReceiptQr({ url, size = 168 }: Props) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()

    const count = qr.getModuleCount()
    // Um só `path` com um quadrado por módulo: mais leve do que centenas de
    // elementos <rect>, e o navegador desenha de uma vez.
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { d, count }
  }, [url])

  return (
    <svg
      className="receipt-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${path.count} ${path.count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code do comprovante"
    >
      <rect width={path.count} height={path.count} fill="#fff" />
      <path d={path.d} fill="var(--color-ink)" />
    </svg>
  )
}
