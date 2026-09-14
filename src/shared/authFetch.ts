import { supabase } from './supabaseClient'

/** Token de acesso atual — `getSession()` já renova sozinho um token vencido. */
async function tokenAtual(fallback?: string): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? fallback
}

function comToken(init: RequestInit | undefined, token: string | undefined): RequestInit {
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

/**
 * `fetch` pras rotas de /api que exigem login. O token da sessão do Supabase
 * vence a cada hora; guardar o da hora do login (ou deixar a aba parada em
 * segundo plano, onde o timer de renovação atrasa) fazia a API responder
 * "Não autenticado." do nada. Aqui o token é sempre buscado na hora e, se
 * mesmo assim vier 401, renova a sessão e tenta mais uma vez — seguro, porque
 * a API rejeita antes de fazer qualquer coisa.
 *
 * `fallbackToken` só é usado se não houver sessão no cliente.
 */
export async function authFetch(input: string, init?: RequestInit, fallbackToken?: string): Promise<Response> {
  const res = await fetch(input, comToken(init, await tokenAtual(fallbackToken)))
  if (res.status !== 401) return res

  const { data } = await supabase.auth.refreshSession()
  const renovado = data.session?.access_token
  if (!renovado) return res
  return fetch(input, comToken(init, renovado))
}
