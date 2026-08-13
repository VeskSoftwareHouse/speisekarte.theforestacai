import { useState } from 'react'
import { Lock } from 'lucide-react'

interface Props {
  onSignIn: (email: string, password: string) => Promise<void>
}

export default function LoginScreen({ onSignIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSignIn(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card__icon">
          <Lock size={24} strokeWidth={2} aria-hidden />
        </div>
        <h2>Acesso ao cardápio</h2>
        <p className="login-card__hint">Entre com seu usuário da equipe para gerenciar o cardápio.</p>

        <label className="admin-form__field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@forestacai.ch"
            autoComplete="username"
            required
          />
        </label>

        <label className="admin-form__field">
          <span>Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="admin-form__error">{error}</p>}

        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
