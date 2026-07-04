import { useState } from 'react'
import { useFeed, startMarket } from './api'
import type { Round } from './types'
import { MarketView } from './components/MarketView'
import { Explainer } from './components/Explainer'

/** Read ?session=<id> from the URL so the launcher can deep-link straight to a live market. */
const initialSession = new URLSearchParams(window.location.search).get('session') ?? ''

/** The market's story in three numbers — computed live from the feed. */
function StatBand({ rounds }: { rounds: Round[] }) {
  const settled = rounds.filter((r) => r.release || r.status === 'settled')
  const solSettled = settled.reduce((s, r) => s + (r.escrow?.amountSol ?? 0), 0)
  return (
    <section className="stats" aria-label="market summary">
      <div className="stat stat-pass">
        <div className="stat-n">{settled.length}</div>
        <div className="stat-l">pages made accessible</div>
      </div>
      <div className="stat stat-settle">
        <div className="stat-n">{solSettled.toFixed(4)}</div>
        <div className="stat-l">SOL settled on-chain</div>
      </div>
      <div className="stat stat-pass">
        <div className="stat-n">100%</div>
        <div className="stat-l">paid only for a verified fix</div>
      </div>
    </section>
  )
}

export default function App() {
  const [session, setSession] = useState(initialSession)
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string>()
  const { rounds, connected, error } = useFeed(session)

  async function onStart() {
    setStarting(true)
    setStartErr(undefined)
    try {
      const id = await startMarket()
      setSession(id)
      const url = new URL(window.location.href)
      url.searchParams.set('session', id)
      window.history.replaceState({}, '', url)
    } catch (e) {
      setStartErr((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="app">
      <header className="app-head">
        <h1><span className="wheel">♿</span> AccessGuard</h1>
        <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} data-testid="conn" title={connected ? 'connected' : (error ?? 'disconnected')} />
        <span className="sub">Agents get paid on Solana the moment a web page is provably made accessible.</span>
      </header>

      {session && rounds.length > 0 && <StatBand rounds={rounds} />}

      <div className="session-bar">
        <input
          aria-label="session id"
          placeholder="paste a market session id…"
          value={session}
          onChange={(e) => setSession(e.target.value.trim())}
        />
        <button onClick={onStart} disabled={starting} data-testid="start">
          {starting ? 'starting…' : 'Start a market'}
        </button>
      </div>
      {startErr && <p className="start-err" data-testid="start-err">{startErr}</p>}

      <Explainer />

      <main>
        {session ? <MarketView rounds={rounds} /> : (
          <p className="empty">Fund your wallets, then <strong>Start a market</strong> — agents will bid, remediate, and settle live.</p>
        )}
      </main>
    </div>
  )
}
