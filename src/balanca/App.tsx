import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Nfc, Scale } from 'lucide-react'
import { formatCHF } from '@shared/format'
import { connectScale, serialSupported, type ScaleConnection, type ScaleStatus } from './scale'

const TOKEN_KEY = 'balanca-token'
const BAUD_KEY = 'balanca-baud'

/** Abaixo disto (já sem o copo) a balança está vazia — não há o que cobrar. */
const MIN_NET_G = 20
/** Quanto o peso precisa ficar parado para valer. */
const STABLE_MS = 1000
/** Variação que ainda conta como "parado" (ruído da balança). */
const STABLE_TOLERANCE_G = 2
/** Quanto a tela espera o cliente aproximar o cartão antes de desistir. */
const PAY_TIMEOUT_MS = 120_000
const PAY_POLL_MS = 1000
const DONE_SCREEN_MS = 7000

interface Config {
  precoPor100g: number
  taraG: number
  pesoMaxG: number
}

type Phase = 'weighing' | 'paying' | 'done' | 'failed'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Peso que ficou parado por STABLE_MS; qualquer mexida zera a contagem. */
function useStableWeight(grams: number): boolean {
  const [stable, setStable] = useState(false)
  const anchor = useRef(grams)

  useEffect(() => {
    if (Math.abs(grams - anchor.current) > STABLE_TOLERANCE_G) {
      anchor.current = grams
      setStable(false)
    }
    const id = setTimeout(() => setStable(true), STABLE_MS)
    return () => clearTimeout(id)
  }, [grams])

  return stable
}

export default function App() {
  const simulator = new URLSearchParams(window.location.search).has('simulador')

  const [token, setToken] = useState(readToken)
  const [tokenDraft, setTokenDraft] = useState('')
  const [config, setConfig] = useState<Config | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  const [gross, setGross] = useState(0)
  const [scaleStatus, setScaleStatus] = useState<ScaleStatus>(serialSupported() ? 'disconnected' : 'unsupported')
  const [scaleError, setScaleError] = useState<string | null>(null)
  const connection = useRef<ScaleConnection | null>(null)

  const [phase, setPhase] = useState<Phase>('weighing')
  const [payError, setPayError] = useState<string | null>(null)
  const [lockedTotal, setLockedTotal] = useState(0)
  // Depois de pagar (ou falhar) o copo ainda está na balança: só volta a cobrar
  // quando alguém o tirar, senão a tela reabriria sozinha com o mesmo peso.
  const [needsClear, setNeedsClear] = useState(false)

  const tara = config?.taraG ?? 0
  const net = Math.max(0, gross - tara)
  const stable = useStableWeight(net)
  const hasCup = net >= MIN_NET_G
  const total = config ? Number(((net / 100) * config.precoPor100g).toFixed(2)) : 0

  // ---- configuração (preço, tara) vinda do servidor ----
  useEffect(() => {
    if (!token) return
    let cancelled = false
    setConfigError(null)
    fetch('/api/balanca-pedido', { headers: { 'x-balanca-token': token } })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (res.status === 401) {
          // Código errado: apaga e volta a pedir.
          try {
            localStorage.removeItem(TOKEN_KEY)
          } catch {
            /* sem storage */
          }
          setToken('')
          setConfigError('Código do totem inválido.')
          return
        }
        if (!res.ok) throw new Error(data?.error ?? 'Falha ao carregar a configuração.')
        setConfig(data as Config)
      })
      .catch((err) => {
        if (!cancelled) setConfigError(err instanceof Error ? err.message : 'Falha ao carregar a configuração.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // ---- balança ----
  const openScale = useCallback(async (userGesture: boolean) => {
    if (!serialSupported()) return
    setScaleStatus('connecting')
    setScaleError(null)
    try {
      let baud = 9600
      try {
        baud = Number(localStorage.getItem(BAUD_KEY)) || 9600
      } catch {
        /* sem storage */
      }
      connection.current = await connectScale(
        baud,
        userGesture,
        setGross,
        () => {
          connection.current = null
          setGross(0)
          setScaleStatus('disconnected')
          setScaleError('A balança desconectou.')
        },
      )
      setScaleStatus('connected')
    } catch (err) {
      setScaleStatus('disconnected')
      // Sem porta autorizada ainda não é erro: é só esperar o primeiro toque.
      if (userGesture) setScaleError(err instanceof Error ? err.message : 'Não foi possível abrir a balança.')
    }
  }, [])

  // Ao ligar o totem, tenta reabrir sozinho a balança já autorizada; enquanto
  // estiver desconectada, repete (cabo religado, balança que demorou a ligar).
  useEffect(() => {
    if (simulator || !serialSupported()) return
    if (scaleStatus === 'disconnected') {
      const id = setTimeout(() => void openScale(false), 3000)
      return () => clearTimeout(id)
    }
  }, [simulator, scaleStatus, openScale])

  useEffect(() => {
    if (!simulator) void openScale(false)
    return () => {
      void connection.current?.close()
    }
  }, [simulator, openScale])

  // Copo tirado: libera para o próximo cliente.
  useEffect(() => {
    if (phase === 'weighing' && needsClear && !hasCup) setNeedsClear(false)
  }, [phase, needsClear, hasCup])

  // ---- pagamento ----
  async function handlePay() {
    if (!config || !hasCup || !stable || phase !== 'weighing') return
    setPhase('paying')
    setPayError(null)
    setLockedTotal(total)

    try {
      const res = await fetch('/api/balanca-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-balanca-token': token },
        body: JSON.stringify({ pesoGramas: net }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.orderId) {
        throw new Error(
          data?.code === 'reader_unavailable'
            ? 'Não foi possível falar com a maquininha. Chame a equipe.'
            : (data?.error ?? 'Não foi possível iniciar o pagamento.'),
        )
      }
      setLockedTotal(data.total ?? total)

      const deadline = Date.now() + PAY_TIMEOUT_MS
      while (Date.now() < deadline) {
        await sleep(PAY_POLL_MS)
        let status: string | null = null
        try {
          const r = await fetch('/api/sumup-confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderId }),
          })
          const d = await r.json()
          status = r.ok && typeof d.status === 'string' ? d.status : null
        } catch {
          continue // falha de rede passageira não encerra a espera
        }
        if (status === 'cancelado') throw new Error('Pagamento recusado ou cancelado.')
        if (status && status !== 'aguardando_pagamento') {
          setNeedsClear(true)
          setPhase('done')
          return
        }
      }
      throw new Error('Tempo esgotado. Se o cartão foi cobrado, chame a equipe.')
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Falha no pagamento.')
      setNeedsClear(true)
      setPhase('failed')
    }
  }

  useEffect(() => {
    if (phase !== 'done') return
    const id = setTimeout(() => setPhase('weighing'), DONE_SCREEN_MS)
    return () => clearTimeout(id)
  }, [phase])

  function saveToken() {
    const value = tokenDraft.trim()
    if (!value) return
    try {
      localStorage.setItem(TOKEN_KEY, value)
    } catch {
      /* sem storage: vale só até recarregar */
    }
    setTokenDraft('')
    setToken(value)
  }

  // ---- telas ----
  if (!token) {
    return (
      <div className="balanca">
        <div className="balanca__card">
          <p className="balanca__brand">THE FOREST AÇAÍ</p>
          <h1 className="balanca__title">Configurar a balança</h1>
          <input
            className="balanca__input"
            type="password"
            placeholder="Código do totem"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveToken()}
            autoFocus
          />
          {configError && <p className="balanca__error">{configError}</p>}
          <button className="balanca__pay" onClick={saveToken} disabled={!tokenDraft.trim()}>
            Salvar
          </button>
        </div>
      </div>
    )
  }

  let body: React.ReactNode

  if (!config) {
    body = configError ? (
      <>
        <div className="balanca__icon balanca__icon--error">
          <AlertTriangle size={44} strokeWidth={2.5} />
        </div>
        <h1 className="balanca__title">Estação indisponível</h1>
        <p className="balanca__hint">{configError}</p>
      </>
    ) : (
      <div className="balanca__icon">
        <Loader2 size={44} className="spin" />
      </div>
    )
  } else if (phase === 'paying') {
    body = (
      <>
        <div className="balanca__icon balanca__icon--pulse">
          <Nfc size={44} strokeWidth={2.5} />
        </div>
        <h1 className="balanca__title">Aproxime o cartão</h1>
        <p className="balanca__hint">Siga as instruções na maquininha ao lado.</p>
        <div className="balanca__total balanca__total--solo">
          <span>TOTAL</span>
          <strong>{formatCHF(lockedTotal)}</strong>
        </div>
      </>
    )
  } else if (phase === 'done') {
    body = (
      <>
        <div className="balanca__icon balanca__icon--ok">
          <CheckCircle2 size={48} strokeWidth={2.5} />
        </div>
        <h1 className="balanca__title">Pagamento aprovado!</h1>
        <p className="balanca__hint">Obrigado, bom apetite! 💜</p>
      </>
    )
  } else if (phase === 'failed') {
    body = (
      <>
        <div className="balanca__icon balanca__icon--error">
          <AlertTriangle size={44} strokeWidth={2.5} />
        </div>
        <h1 className="balanca__title">Pagamento não concluído</h1>
        <p className="balanca__hint">{payError}</p>
        <button className="balanca__pay" onClick={() => setPhase('weighing')}>
          VOLTAR
        </button>
      </>
    )
  } else if (needsClear || !hasCup) {
    body = (
      <>
        <div className="balanca__icon">
          <Scale size={48} strokeWidth={2} />
        </div>
        <h1 className="balanca__title">{needsClear ? 'Retire o copo da balança' : 'Coloque o copo na balança'}</h1>
        <p className="balanca__hint">
          Preço: {formatCHF(config.precoPor100g)} por 100 g
        </p>
      </>
    )
  } else {
    body = (
      <>
        <h1 className="balanca__title">O seu Açaí Bowl</h1>
        <div className="balanca__readout">
          <div className="balanca__metric">
            <span>PESO</span>
            <strong>{net} g</strong>
          </div>
          <div className="balanca__metric balanca__metric--total">
            <span>TOTAL</span>
            <strong>{formatCHF(total)}</strong>
          </div>
        </div>
        <button className="balanca__pay" onClick={handlePay} disabled={!stable}>
          {stable ? 'PAGAR AGORA' : 'Pesando…'}
        </button>
        <p className="balanca__hint balanca__hint--small">{formatCHF(config.precoPor100g)} por 100 g</p>
      </>
    )
  }

  const showConnect = !simulator && serialSupported() && scaleStatus !== 'connected' && phase === 'weighing'

  return (
    <div className="balanca">
      <div className="balanca__card">
        <p className="balanca__brand">THE FOREST AÇAÍ</p>
        {body}

        {showConnect && (
          <div className="balanca__connect">
            <button className="balanca__link" onClick={() => void openScale(true)} disabled={scaleStatus === 'connecting'}>
              {scaleStatus === 'connecting' ? 'Conectando a balança…' : 'Conectar a balança'}
            </button>
            {scaleError && <p className="balanca__error">{scaleError}</p>}
          </div>
        )}
        {!simulator && scaleStatus === 'unsupported' && (
          <p className="balanca__error">Este navegador não lê a balança. Use o Chrome ou o Edge.</p>
        )}
      </div>

      {simulator && (
        <div className="balanca__sim">
          <strong>Simulador de balança</strong>
          <span>Peso bruto: {gross} g (tara {tara} g)</span>
          <div>
            <button onClick={() => setGross(tara + 350)}>Copo com 350 g</button>
            <button onClick={() => setGross((g) => g + 50)}>+50 g</button>
            <button onClick={() => setGross((g) => Math.max(0, g - 50))}>−50 g</button>
            <button onClick={() => setGross(0)}>Tirar copo</button>
          </div>
        </div>
      )}
    </div>
  )
}
