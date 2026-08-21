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

interface PagedResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function fetchPaged<T>(
  build: (from: number, to: number) => PromiseLike<PagedResult<T>>,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await build(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) return all
  }
}
