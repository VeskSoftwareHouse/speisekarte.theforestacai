/**
 * O PostgREST corta a resposta num teto de linhas — 1000 no padrão do Supabase
 * — e devolve o pedaço sem avisar que cortou. Consulta que pode passar disso
 * lê em páginas até a última vir curta.
 *
 * Não é hipótese: o quadro da cozinha pedia todos os pedidos já pagos em ordem
 * crescente de data, e quando o histórico passou de mil o pedido recém-feito
 * ficava fora do corte — o pagamento entrava, a comanda não aparecia.
 */
export const PAGE_SIZE = 1000

/**
 * Esperas entre tentativas de repetir uma página que falhou. Existem por
 * causa de uma falha passageira específica e recorrente no painel da equipe:
 * "JWT issued at future", que o Supabase devolve quando o relógio de quem
 * emite e quem valida o token diverge por um instante — e que passa sozinha
 * em segundos, sem precisar de nada além de tentar de novo. Sem isto, esse
 * tropeço de relógio virava "Erro ao carregar pedidos" em vermelho, parado
 * na tela até alguém recarregar a página na mão. Mesmos tempos que
 * src/shared/hooks/useMenu.ts usa pro mesmo motivo, do lado do App da Mesa.
 */
const RETRY_DELAYS_MS = [400, 900, 2_000]
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface PagedResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchPaged<T>(
  build: (from: number, to: number) => PromiseLike<PagedResult<T>>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE
    const to = (page + 1) * PAGE_SIZE - 1

    let lastMessage = ''
    let rows: T[] = []
    let ok = false
    for (let attempt = 0; !ok && attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1])
      const { data, error } = await build(from, to)
      if (!error) {
        rows = data ?? []
        ok = true
        break
      }
      lastMessage = error.message
    }
    if (!ok) throw new Error(lastMessage)

    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}
