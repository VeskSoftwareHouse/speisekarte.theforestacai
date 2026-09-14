import { useCallback, useEffect, useState } from 'react'
import { retryLoad } from '@shared/retryLoad'
import { authFetch } from '@shared/authFetch'

export interface AdminUser {
  id: string
  email: string
  nome: string
  created_at: string
  last_sign_in_at: string | null
}

export interface UserInput {
  email: string
  password?: string
  nome: string
}

async function request(accessToken: string, path: string, init?: RequestInit) {
  const res = await authFetch(
    path,
    {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    },
    accessToken,
  )
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Erro ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export function useUserAdmin(accessToken: string) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    // `request` lança em vez de devolver { error } — retryLoad só sabe repetir
    // olhando o resultado, então a tentativa aqui apanha o erro e o embrulha
    // num resultado, pra depois desembrulhar do lado de fora.
    const result = await retryLoad(
      async () => {
        try {
          return { data: (await request(accessToken, '/api/admin-users')) as { users: unknown }, error: null }
        } catch (err) {
          return { data: null, error: err instanceof Error ? err : new Error('Não foi possível carregar usuários.') }
        }
      },
      (r) => !!r.error,
    )
    if (result.error) {
      setError(result.error.message)
    } else {
      setUsers((result.data.users as typeof users) ?? [])
      setError(null)
    }
    setLoading(false)
  }, [accessToken])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function createUser(input: UserInput) {
    await request(accessToken, '/api/admin-users', { method: 'POST', body: JSON.stringify(input) })
    await fetchAll()
  }

  async function updateUser(id: string, input: UserInput) {
    await request(accessToken, `/api/admin-users?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    await fetchAll()
  }

  async function deleteUser(id: string) {
    await request(accessToken, `/api/admin-users?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await fetchAll()
  }

  return { users, loading, error, createUser, updateUser, deleteUser }
}
