/**
 * Espera entre tentativas de repetir uma consulta que falhou. Existe por
 * causa de uma falha passageira específica e recorrente no painel da
 * equipe: "JWT issued at future", que o Supabase devolve quando o relógio
 * de quem emite e quem valida o token diverge por um instante — e que
 * passa sozinha em segundos, sem precisar de nada além de tentar de novo.
 * Sem isto, esse tropeço de relógio virava um aviso vermelho ("Erro ao
 * carregar pedidos") parado na tela até alguém recarregar a página na mão.
 */
const RETRY_DELAYS_MS = [400, 900, 2_000]
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Chama `attempt()` e repete (com as esperas acima) enquanto `hasFailed`
 * disser que o resultado foi uma falha — pensado para o formato do Supabase
 * (`{ data, error }`, ou uma tupla de vários desses de um `Promise.all`),
 * mas serve para qualquer resultado. Desiste depois da última espera e
 * devolve o resultado da tentativa final, falha ou não — quem chama decide
 * o que fazer com ela, igual já fazia antes de existir retry nenhum.
 */
export async function retryLoad<T>(attempt: () => PromiseLike<T>, hasFailed: (result: T) => boolean): Promise<T> {
  let result = await attempt()
  for (let i = 0; hasFailed(result) && i < RETRY_DELAYS_MS.length; i++) {
    await sleep(RETRY_DELAYS_MS[i])
    result = await attempt()
  }
  return result
}
