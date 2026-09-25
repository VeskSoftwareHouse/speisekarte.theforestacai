import { useState } from 'react'

interface Result {
  methods: { id: string; name: string }[]
  twintDisponivel: boolean
}

/**
 * Ferramenta temporária: pergunta à SumUp quais métodos de pagamento estão
 * liberados pra esta conta (Twint incluído), criando e apagando um checkout
 * de teste de CHF 1.00. Ver api/diagnostico-sumup-metodos.ts. Remover depois
 * de usada — não é parte do fluxo normal do painel.
 */
export default function SumupMethodsDiagnostic({ accessToken }: { accessToken: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCheck() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/diagnostico-sumup-metodos', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Falha ao consultar métodos.')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar métodos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-maintenance-box">
      <div>
        <strong>Diagnóstico: métodos de pagamento liberados na SumUp</strong>
        <p>Cria e apaga um checkout de teste (CHF 1.00, nunca cobrado) só pra perguntar à SumUp quais métodos essa conta pode usar.</p>
      </div>
      <button className="btn btn-outline" onClick={handleCheck} disabled={loading}>
        {loading ? 'Consultando…' : 'Consultar métodos disponíveis'}
      </button>
      {error && <p className="equipe-app__error">{error}</p>}
      {result && (
        <p className="admin-maintenance-box__result">
          Twint {result.twintDisponivel ? '✅ disponível' : '❌ não aparece'} — métodos:{' '}
          {result.methods.map((m) => m.name).join(', ') || 'nenhum retornado'}
        </p>
      )}
    </div>
  )
}
