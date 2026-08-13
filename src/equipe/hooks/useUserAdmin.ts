import { useCallback, useEffect, useState } from 'react'

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
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
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
    try {
      const data = await request(accessToken, '/api/admin-users')
      setUsers(data.users)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar usuários.')
    } finally {
      setLoading(false)
    }
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
