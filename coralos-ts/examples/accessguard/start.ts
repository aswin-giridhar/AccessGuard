/**
 * AccessGuard market starter — a public-good accessibility economy on the CoralOS rails.
 *
 * A buyer (a site owner / grant program) posts an `accessguard` WANT naming a page; accessibility
 * seller agents compete with bids; the winner remediates the page and delivers WCAG-fixed HTML;
 * an INDEPENDENT, DETERMINISTIC verifier re-audits the delivery and only a real, regression-free
 * improvement releases the Solana escrow (arbiter settlement). No fix, no pay — refunded.
 *
 *   WANT accessguard <page> → BIDs (competing a11y sellers) → AWARD → escrow → remediate
 *        → DELIVERED <hash-bound fixed HTML> → VERIFY → VERIFIED pass → ARBITER_RELEASED
 *        (no improvement / regression / no-op → verdict fail → funds stay refundable)
 *
 * The verifier's acceptance is the deterministic WCAG engine (packages/agent-runtime/src/wcag),
 * NOT an LLM opinion — so the settlement is reproducible by anyone and holds up under dispute.
 *
 *   CORAL_SERVER_URL  default http://localhost:5555
 *   CORAL_TOKEN       default dev   (must be in coral.toml [auth] keys)
 *   ACCESSGUARD_PAGES csv of page args (bundled fixture keys, or http(s) URLs — one token each)
 *
 * Run from the host after `docker compose up coral`:  npm install && npm start
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  Keypair, Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

const BASE = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555'
const TOKEN = process.env.CORAL_TOKEN ?? 'dev'
const NS = 'default'
const AUTH = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

// ── Load repo-root .env (2 levels up: accessguard → examples → root) ──
function loadEnv(): Record<string, string> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env — rely on process.env */ }
  return env
}

// ── Typed coral option values ──
const str = (value: string) => ({ type: 'string', value })
const f64 = (value: number) => ({ type: 'f64', value })

const agent = (name: string, options: Record<string, unknown>) => ({
  id: { name, version: '0.1.0', registrySourceId: { type: 'local' } },
  name,
  provider: { type: 'local', runtime: 'docker' },
  options,
})

/**
 * Make the seller payout wallet rent-exempt. `direct` settlement credits the seller account directly on
 * release; if it's a fresh 0-balance account and the settlement amount is below the rent-exempt minimum
 * (~0.00089 SOL for a 0-data account), the release tx fails with InsufficientFundsForRent. A one-time
 * top-up from the (already-funded) buyer fixes it; subsequent runs see it's exempt and skip.
 */
async function ensureSellerRentExempt(rpc: string, sellerPubkey: string, buyerB58: string): Promise<void> {
  try {
    const conn = new Connection(rpc, 'confirmed')
    const seller = new PublicKey(sellerPubkey)
    const min = await conn.getMinimumBalanceForRentExemption(0)
    if ((await conn.getBalance(seller)) >= min) return
    const buyer = Keypair.fromSecretKey(bs58.decode(buyerB58))
    const lamports = min + Math.round(0.001 * LAMPORTS_PER_SOL) // exempt + a buffer so releases keep it exempt
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: buyer.publicKey, toPubkey: seller, lamports }))
    const sig = await sendAndConfirmTransaction(conn, tx, [buyer])
    console.log(`   funded seller ${sellerPubkey} to rent-exempt (+${lamports} lamports) — ${sig}`)
  } catch (e) {
    console.error(`[accessguard] WARN: could not rent-exempt the seller wallet (${(e as Error).message}). ` +
      'Direct-settlement releases may fail until the seller holds the rent-exempt minimum; fund the buyer first.')
  }
}

async function main() {
  const env = loadEnv()
  const wallet = env.WALLET
  const keypair = env.BUYER_KEYPAIR_B58
  if (!wallet || !keypair) {
    throw new Error('WALLET and BUYER_KEYPAIR_B58 must be set in .env — run `node scripts/setup.js`')
  }
  const rpc = env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
  const trace = env.TRACE ?? ''

  // Preflight: the seller payout wallet must be rent-exempt for direct-settlement releases to land.
  await ensureSellerRentExempt(rpc, wallet, keypair)

  // LLM provider — the kit uses Venice AI; flip the whole market with LLM_PROVIDER in .env (see LLM.md).
  const llmOpts: Record<string, unknown> = {}
  if (env.VENICE_API_KEY) llmOpts.VENICE_API_KEY = str(env.VENICE_API_KEY)
  if (env.OPENAI_API_KEY) llmOpts.OPENAI_API_KEY = str(env.OPENAI_API_KEY)
  if (env.ANTHROPIC_API_KEY) llmOpts.ANTHROPIC_API_KEY = str(env.ANTHROPIC_API_KEY)
  if (env.LLM_PROVIDER) llmOpts.LLM_PROVIDER = str(env.LLM_PROVIDER)
  if (env.LLM_MODEL) llmOpts.LLM_MODEL = str(env.LLM_MODEL)
  if (trace) llmOpts.TRACE = str(trace)

  // The lineup: a generalist a11y fixer vs a premium specialist — a real best-value contest.
  // ACCESSGUARD_LAZY=1 flips seller-a11y into a no-op to demo the verifier-fail → refund path.
  const sellers = ['seller-a11y', 'seller-a11y-pro']
  const lazy = env.ACCESSGUARD_LAZY === '1'

  // Pages to fix — single tokens on the wire (bundled fixture keys, or http(s) URLs).
  const pages = env.ACCESSGUARD_PAGES ?? 'council-parking,nhs-appointment,tax-portal'

  // Settlement mode. The shared devnet arbiter program's `config` PDA is a global singleton already
  // claimed by another key, so a freshly-generated arbiter (scripts/setup.js) hits NotArbiter on release.
  // Default to base-escrow `direct` settlement (buyer deposits + releases, still gated by the verifier's
  // deterministic VERIFIED pass). Override with SETTLEMENT_MODE=arbiter in .env if you hold the config key.
  const settlement = (env.SETTLEMENT_MODE ?? 'direct').toLowerCase() === 'arbiter' ? 'arbiter' : 'direct'

  const sellerAgents = [
    agent('seller-a11y', {
      SELLER_WALLET: str(wallet), SOLANA_RPC_URL: str(rpc), AGENT_NAME: str('seller-a11y'),
      SERVICES: str('accessguard'), SETTLEMENT_MODE: str(settlement),
      ...(lazy ? { ACCESSGUARD_LAZY: str('1') } : {}), ...llmOpts,
    }),
    agent('seller-a11y-pro', {
      SELLER_WALLET: str(wallet), SOLANA_RPC_URL: str(rpc), AGENT_NAME: str('seller-a11y-pro'),
      SERVICES: str('accessguard'), SETTLEMENT_MODE: str(settlement), ...llmOpts,
    }),
  ]

  const sres = await fetch(`${BASE}/api/v1/local/session`, {
    method: 'POST', headers: AUTH,
    body: JSON.stringify({
      agentGraphRequest: {
        agents: [
          agent('buyer-agent', {
            BUYER_KEYPAIR_B58: str(keypair),
            SETTLEMENT_MODE: str(settlement),
            // Arbiter settlement needs the neutral 3rd signer's key AND a matching on-chain config;
            // only forwarded when explicitly running SETTLEMENT_MODE=arbiter with a config you own.
            ...(settlement === 'arbiter' && env.ARBITER_KEYPAIR_B58 ? { ARBITER_KEYPAIR_B58: str(env.ARBITER_KEYPAIR_B58) } : {}),
            AGENT_NAME: str('buyer-agent'),
            SOLANA_RPC_URL: str(rpc),
            SELLER_WALLET: str(wallet),
            BUYER_MAX_SOL: f64(Number(env.BUYER_MAX_SOL ?? '0.001')),
            BUYER_SERVICE: str('accessguard'),
            BUYER_ARGS: str(pages),
            MARKET_SELLERS: str(sellers.join(',')),
            // Release is gated on the independent verifier's VERIFIED pass (deterministic WCAG re-audit).
            VERIFIER_AGENT: str('verifier-agent'),
            ...llmOpts,
          }),
          ...sellerAgents,
          agent('verifier-agent', { AGENT_NAME: str('verifier-agent'), ...llmOpts }),
        ],
      },
      namespaceProvider: { type: 'create_if_not_exists', namespaceRequest: { name: NS } },
      execution: { mode: 'immediate' },
    }),
  })
  if (!sres.ok) throw new Error(`session create failed: ${sres.status} ${await sres.text()}`)
  const { sessionId } = await sres.json() as { sessionId: string }

  console.log(`\n✅ AccessGuard market session ${sessionId} — buyer + ${sellers.join(', ')} + verifier-agent.`)
  console.log(`   receive wallet: ${wallet}`)
  console.log('   The buyer posts an accessguard page; a11y sellers bid; the winner remediates; the verifier re-audits and gates release.\n')
  console.log('   Watch the market:')
  console.log('     docker logs -f buyer-agent       # WANT → AWARD → DEPOSITED → verified → ARBITER_RELEASED')
  console.log('     docker logs -f seller-a11y       # BID → ESCROW_REQUIRED → DELIVERED (WCAG-fixed HTML)')
  console.log('     docker logs -f verifier-agent    # VERIFY in → deterministic WCAG verdict out')
  console.log(`   Run ledger: every round lands in examples/marketplace/runs/ via the feed server.\n`)
}

main().catch((e) => { console.error(`[accessguard] ${e}`); process.exitCode = 1 })
