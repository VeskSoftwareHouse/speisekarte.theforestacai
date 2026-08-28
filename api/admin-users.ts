import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { requireCaller } from './_auth'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function mapUser(u: {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
  created_at: string
  last_sign_in_at?: string | null
}) {
  return {
    id: u.id,
    email: u.email ?? '',
    nome: typeof u.user_metadata?.nome === 'string' ? (u.user_metadata.nome as string) : '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado (SUPABASE_SERVICE_ROLE_KEY ausente).' })
    return
  }

  const caller = await requireCaller(req)
  if (!caller) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 })
      if (error) throw error
      res.status(200).json({ users: data.users.map(mapUser) })
      return
    }

    if (req.method === 'POST') {
      const { email, password, nome } = req.body ?? {}
      if (!email || !password) {
        res.status(400).json({ error: 'Email e senha são obrigatórios.' })
        return
      }
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: nome ? { nome } : undefined,
      })
      if (error) throw error
      res.status(201).json({ user: mapUser(data.user) })
      return
    }

    if (req.method === 'PATCH') {
      const id = typeof req.query.id === 'string' ? req.query.id : null
      if (!id) {
        res.status(400).json({ error: 'ID do usuário é obrigatório.' })
        return
      }
      const { email, password, nome } = req.body ?? {}
      const attrs: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {}
      if (email) attrs.email = email
      if (password) attrs.password = password
      if (nome !== undefined) attrs.user_metadata = { nome }
      const { data, error } = await admin.auth.admin.updateUserById(id, attrs)
      if (error) throw error
      res.status(200).json({ user: mapUser(data.user) })
      return
    }

    if (req.method === 'DELETE') {
      const id = typeof req.query.id === 'string' ? req.query.id : null
      if (!id) {
        res.status(400).json({ error: 'ID do usuário é obrigatório.' })
        return
      }
      if (id === caller.id) {
        res.status(400).json({ error: 'Você não pode excluir seu próprio usuário.' })
        return
      }
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw error
      res.status(204).end()
      return
    }

    res.status(405).json({ error: 'Método não permitido.' })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro inesperado.' })
  }
}
