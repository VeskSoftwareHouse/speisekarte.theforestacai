/**
 * Leitura da balança. O navegador fala com ela pela Web Serial API (Chrome/
 * Edge): a balança aparece como uma porta serial (RS-232 ou USB) e despeja o
 * peso em linhas de texto, várias vezes por segundo.
 *
 * Cada fabricante formata a linha de um jeito (Mettler: "S S   123.4 g";
 * Ohaus: "  123.4 g"; outros com sinal, "ST,GS,"...), então o parser só procura
 * "número + g/kg" — e a estabilidade NÃO vem do aparelho, é medida aqui (ver
 * useStableWeight em App.tsx): o peso só vale depois de ficar parado.
 */

export type ScaleStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

// Número com sinal opcional, ponto ou vírgula decimal, seguido de g ou kg.
const LINE_RE = /([+-]?\d+(?:[.,]\d+)?)\s*(kg|g)\b/i

/** Gramas de uma linha da balança, ou null se a linha não traz um peso. */
export function parseWeightLine(line: string): number | null {
  const m = LINE_RE.exec(line)
  if (!m) return null
  const value = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(value)) return null
  return Math.round(m[2].toLowerCase() === 'kg' ? value * 1000 : value)
}

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
}

interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(): Promise<SerialPortLike>
}

function getSerial(): SerialLike | null {
  return (navigator as unknown as { serial?: SerialLike }).serial ?? null
}

export const serialSupported = () => getSerial() !== null

export interface ScaleConnection {
  close: () => Promise<void>
}

/**
 * Abre a balança e chama `onWeight` a cada leitura. Sem `userGesture`, só
 * reabre uma porta já autorizada antes (é o que acontece quando o totem religa
 * sozinho); com ele, pede a escolha da porta — o Chrome exige um toque para isso.
 * Lança se não houver porta ou se ela falhar; `onClosed` avisa quando a leitura
 * para depois de aberta (cabo solto).
 */
export async function connectScale(
  baudRate: number,
  userGesture: boolean,
  onWeight: (grams: number) => void,
  onClosed: () => void,
): Promise<ScaleConnection> {
  const serial = getSerial()
  if (!serial) throw new Error('Este navegador não lê balança (use Chrome ou Edge).')

  let port: SerialPortLike | undefined = (await serial.getPorts())[0]
  if (!port) {
    if (!userGesture) throw new Error('Nenhuma balança autorizada ainda.')
    port = await serial.requestPort()
  }
  await port.open({ baudRate })
  if (!port.readable) throw new Error('A porta da balança não pode ser lida.')

  const reader = port.readable.getReader()
  const decoder = new TextDecoder()
  let closing = false

  void (async () => {
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Linhas terminam em CR, LF ou ETX, conforme o fabricante.
        const parts = buffer.split(/[\r\n\x03]+/)
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const grams = parseWeightLine(part)
          if (grams !== null) onWeight(grams)
        }
        // Linha sem terminador que nunca fecha: descarta em vez de crescer.
        if (buffer.length > 200) buffer = ''
      }
    } catch {
      // Erro de leitura (cabo solto): cai no aviso de desconexão abaixo.
    } finally {
      reader.releaseLock()
      if (!closing) onClosed()
    }
  })()

  return {
    close: async () => {
      closing = true
      try {
        await reader.cancel()
      } catch {
        // já fechada
      }
      try {
        await port!.close()
      } catch {
        // já fechada
      }
    },
  }
}
