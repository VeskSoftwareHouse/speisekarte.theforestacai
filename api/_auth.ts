import type { VercelRequest } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

export interface AuthedUser {
  id: string
}

/**
 * Confere se quem chamou está logado como equipe. Este app não tem papéis —
 * é "logado" ou não —, então isto só bloqueia quem não tem sessão nenhuma;
 * não confunda com autorização por função. Usa a chave anon só para validar
 * o token contra o Supabase Auth, nunca para ler/escrever dado nenhum.
 */
export async function requireCaller(req: VercelRequest): Promise<AuthedUser | null> {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token || !supabaseUrl || !anonKey) return null

  const anonClient = createClient(supabaseUrl, anonKey)
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id }
}
