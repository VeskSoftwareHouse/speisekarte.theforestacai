import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'

/**
 * Balão de detalhe que segue o cursor pelos relatórios.
 *
 * O `title` do próprio navegador daria conta do texto, mas ele demora quase um
 * segundo para aparecer, some sozinho depois de alguns segundos e não aceita
 * formatação — em uma tela feita para varrer com os olhos, isso é o mesmo que
 * não existir. Aqui o balão é imediato e pode mostrar linhas separadas.
 *
 * Vale como camada extra, nunca como único lugar da informação: o Painel da
 * Equipe roda em tablet, e onde não há mouse não há hover. Todo número que o
 * balão detalha continua escrito na tela.
 */

interface TooltipState {
  x: number
  y: number
  content: ReactNode
}

interface TooltipHandlers {
  onMouseEnter: (event: ReactMouseEvent) => void
  onMouseMove: (event: ReactMouseEvent) => void
  onMouseLeave: () => void
}

interface TooltipApi {
  /** Espalhe o retorno no elemento: `<li {...tooltip.bind(<>…</>)}>`. */
  bind: (content: ReactNode) => TooltipHandlers
  /**
   * Para quem decide o conteúdo dentro do próprio handler — o gráfico de
   * tendência é um alvo só para doze meses, e descobre de qual mês se trata
   * pela posição do cursor.
   */
  show: (event: ReactMouseEvent, content: ReactNode) => void
  hide: () => void
}

const TooltipContext = createContext<TooltipApi | null>(null)

/** Fora do provider o balão simplesmente não acontece, e nada quebra. */
const NO_TOOLTIP: TooltipApi = {
  bind: () => ({ onMouseEnter: () => {}, onMouseMove: () => {}, onMouseLeave: () => {} }),
  show: () => {},
  hide: () => {},
}

export function useTooltip(): TooltipApi {
  return useContext(TooltipContext) ?? NO_TOOLTIP
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  const api = useMemo<TooltipApi>(
    () => ({
      show: (event, content) => setState({ x: event.clientX, y: event.clientY, content }),
      hide: () => setState(null),
      bind: (content) => ({
        onMouseEnter: (event) => setState({ x: event.clientX, y: event.clientY, content }),
        // O conteúdo é remontado a cada movimento porque ele depende da linha
        // sob o cursor, e trocar de linha sem sair do elemento acontece direto
        // (o gráfico de tendência é um alvo só para doze meses).
        onMouseMove: (event) => setState({ x: event.clientX, y: event.clientY, content }),
        onMouseLeave: () => setState(null),
      }),
    }),
    [],
  )

  // Posiciona depois de medir: acima do cursor quando cabe, abaixo quando não,
  // e sempre dentro da janela. Sem medir, um balão perto da borda direita
  // nasceria cortado pela metade.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !state) return
    const rect = el.getBoundingClientRect()
    const left = Math.min(Math.max(8, state.x - rect.width / 2), window.innerWidth - rect.width - 8)
    const above = state.y - rect.height - 14
    el.style.left = `${left}px`
    el.style.top = `${above < 8 ? state.y + 20 : above}px`
  }, [state])

  return (
    <TooltipContext.Provider value={api}>
      {children}
      {state && (
        <div ref={ref} className="report-tooltip" role="tooltip">
          {state.content}
        </div>
      )}
    </TooltipContext.Provider>
  )
}

/** Corpo padrão do balão: um título e as linhas de detalhe. */
export function TooltipBody({ title, lines }: { title: string; lines: (string | null | false)[] }) {
  return (
    <>
      <strong className="report-tooltip__title">{title}</strong>
      {lines.filter(Boolean).map((lineText) => (
        <span key={String(lineText)} className="report-tooltip__line">
          {lineText}
        </span>
      ))}
    </>
  )
}

/** Bind pronto para quem só precisa de título e linhas. */
export function useTooltipBody(): (title: string, lines: (string | null | false)[]) => TooltipHandlers {
  const tooltip = useTooltip()
  return useCallback((title, lines) => tooltip.bind(<TooltipBody title={title} lines={lines} />), [tooltip])
}
