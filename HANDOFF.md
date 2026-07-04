# AccessGuard — Project Handoff / Context

Self-contained context for anyone (human or AI agent) taking over this project.

## What this is

**AccessGuard** is a hackathon project (UK AI Agent Hackathon EP5) targeting two bounties:

- **CoralOS / STUK ($5k, primary)** — a multi-agent marketplace on CoralOS with Solana devnet escrow settlement.
- **GCC / ETH "AI for Good" ($1k)** — a Python reference implementation for public-funding / accessibility.

Core idea: a **deterministic WCAG 2.2 accessibility audit engine used as a trustless oracle**. Buyer
agents post inaccessible web pages; competing seller agents remediate them; an **independent verifier
re-audits deterministically** and only a real, regression-free improvement releases on-chain escrow.
"No fix, no pay."

## Workspace layout

Root: `e:\Hackathon\uk_ai_agent_5_hack_2026\`

The active project is a **polyglot monorepo** at `accessguard\`:

- `accessguard\gcc-python\` — Python GCC "AI for Good" reference + reference economy.
  Run from the root `.venv`: `cd gcc-python; ..\..\.venv\Scripts\python.exe demo.py`.
  Also `mcp_server.py` + `web/` (uvicorn `web.server:app --port 8000`).
- `accessguard\coralos-ts\` — TypeScript **CoralOS fork** (git remote `trilltino/solana_coralOS`,
  branch `main`). Devnet escrow, coral-server MCP. **This is where the live demo lives.**
- `accessguard\README.md` — top-level framing of both tracks + the shared deterministic WCAG oracle.

> There is also a **stale pre-consolidation copy at `e:\Hackathon\uk_ai_agent_5_hack_2026\solana_coralOS\`**.
> Ignore it — its only lint warning (`Cannot find type definition file for 'node'` in
> `examples/marketplace/web/tsconfig.json`) is pre-existing and out of scope. All work happens in
> `accessguard\coralos-ts\`.

## CoralOS fork model (how the demo is built)

Minimal fork, as the kit intends:

- **Service:** `accessguard` case in `coral-agents/seller-agent/src/service.ts` — `deliverService()`
  runs the deterministic WCAG engine (audit -> remediate -> re-audit) and returns
  `{ fixed: <WCAG-repaired HTML>, resolved: [...], scoreBefore, scoreAfter }`.
- **Sellers:** two personas reusing the `seller-agent` image — `coral-agents/seller-a11y` (generalist,
  floor 0.0003 SOL) and `coral-agents/seller-a11y-pro` (premium, floor 0.0006 SOL). Each has its own
  `coral-agent.toml` (`image = "seller-agent:0.1.0"`, `SERVICES=accessguard`).
- **Buyer:** `coral-agents/buyer-agent/src/index.ts` — best-**value** selection within a code-enforced
  budget, escrow deposit/release, verifier-gated.
- **Verifier:** `coral-agents/verifier-agent/src/verify.ts` — independent deterministic WCAG re-audit;
  hash-binds the delivered artifact (sha256) and returns pass/fail.
- **WCAG engine (TS):** `packages/agent-runtime/src/wcag/` (`audit.ts`, `dom.ts`, `accept.ts`, `pages.ts`).
- **Example launcher:** `examples/accessguard/start.ts` (root `npm run accessguard`) — creates the coral
  session with buyer + 2 sellers + verifier.
- **Visualizer:** `examples/marketplace/web` (React/Vite) + `examples/marketplace/feed` (feed server).
  `AccessGuardPanel.tsx` renders the WCAG score jump.

## Feature work already completed (all tested)

1. **zh-Hans / zh-Hant disambiguation** in BOTH engines.
   - Python: `gcc-python` (originally `accessguard-exchange`) `engine/wcag.py` — `_detect_zh_variant`,
     `_is_cjk_dominant` -> suggests `lang="zh-Hans"|"zh-Hant"|"zh"`; samples `inaccessible-zh.html` (Hant)
     + `inaccessible-zh-hans.html` (Hans).
   - TS: `wcag/dom.ts` `detectZhVariant` + `audit.ts` html-lang rule. 12 vitest tests pass.
2. **Reputation/latency-weighted best-value awards** — pure `pickBestValue()` in
   `packages/agent-runtime/src/market/protocol.ts`: `value = priceWeight*(minPrice/price) + repWeight*(rep/100)`,
   `TIE_TOLERANCE=0.05`; ties -> fewer session awards -> earlier bid -> name. Buyer tracks `awardsBySeller`;
   `reputation.ts` exposes `fetchReputation`/`reputationScores`. 28 agent-runtime tests pass; buyer tsc clean.
3. **Visualizer wired to accessguard** — `AccessGuardPanel.tsx` (scoreBefore->scoreAfter bar, resolved
   fixes, remaining, collapsible fixed HTML); `RoundCard.tsx` dispatches on `service==='accessguard'`;
   `styles.css` `.ag-*`; `accessguardRound` fixture + tests (6/6 web tests pass). Root scripts
   `accessguard:feed` + `accessguard:web`.
4. **Docker images** built from `coralos-ts` root: `seller-agent:0.1.0`, `buyer-agent:0.1.0`,
   `verifier-agent:0.1.0`.

## Live devnet settlement — fixes made (important)

A live devnet run initially failed. Two root causes, both fixed in `accessguard/coralos-ts`:

### Fix 1 — `NotArbiter` (arbiter settlement unusable on shared devnet)

The deployed `arbiter` program (`FJtuVXsyXuRKqgJBEPAXmktkd13CqStapgevzGwYktXd`) uses a `config` PDA with
`seeds = [b"config"]` — a **global singleton** already claimed by arbiter pubkey `Ay2Gq...`, created with
`init` (not `init_if_needed`). A freshly generated `scripts/setup.js` arbiter can never claim it, so
`arbitrate_release` always fails with `NotArbiter`.

**Fix:** defaulted `examples/accessguard/start.ts` to **`SETTLEMENT_MODE=direct`** (env-overridable).
Direct mode uses the base escrow program `R5NWNg9eRLWWQU81Xbzz5Du1k7jTDeeT92Ty6qCeXet` — buyer
`initialize` (deposit) + `release`, still gated on the verifier's pass via
`enforce({ kind: 'release', verified }, policy)`. `SETTLEMENT_MODE` is wired into both sellers (they set
`terms.settlement` in `ESCROW_REQUIRED`; the buyer honors `terms.settlement ?? SETTLEMENT_MODE`) and the
buyer. Both seller and buyer `coral-agent.toml` already declare `SETTLEMENT_MODE`.

### Fix 2 — `InsufficientFundsForRent` on release

Base escrow `release` (`examples/txodds/escrow/programs/escrow/src/lib.rs`, ~lines 70-88) credits the
escrow `amount` **directly to the seller account**, then `close = buyer`. Bid amounts (0.0003/0.0006 SOL)
are **below the rent-exempt minimum for a 0-data account (~890,880 lamports)**, so paying a fresh
0-balance seller fails simulation.

**Fix:** added an idempotent `ensureSellerRentExempt()` preflight in `examples/accessguard/start.ts` that,
on first run, transfers rent-exempt-minimum + buffer from the (already funded) buyer to the seller wallet;
subsequent runs detect it's exempt and skip. Added `@solana/web3.js` + `bs58` to
`examples/accessguard/package.json`; the example typechecks clean.

### Result

The market settles on-chain end-to-end — 16+ consecutive `RELEASED` devnet txs, both sellers paid, each
release gated on a deterministic `0 -> 100` WCAG verifier pass. Example release tx (devnet):
`312xYBHABCnMH5aZFMfnNcNdU4PFUNPjnTk8kTvMr1ibc15iYTtbq4An6hTo39MytSH9rw5ekLR4W9jHVTRmDCs3`.

Docs updated: `examples/accessguard/README.md` now has a `## Settlement` section; the flow verb is
`RELEASED` (not `ARBITER_RELEASED`) in direct mode.

## Current runtime state (as of handoff)

- **Wallets** (in `accessguard/coralos-ts/.env`, gitignored):
  - buyer `AvksMNt7cXKSzDALXC6yNrboWWW3YeLAVisLobtAozLp` (~1.95 SOL devnet)
  - seller `FHrVM4tVLLs4wvevv3Y9kejVFAtDUT6vc1pTK8i7YhT8` (rent-exempt, ~0.018 SOL from settled bids)
- **LLM:** Venice AI — `.env` has `VENICE_API_KEY` + `LLM_PROVIDER=venice`.
  **The Venice key was exposed in chat and should be rotated.**
- **Docker:** `coral` (coral-server) is UP. The 4 agent containers for session
  `3c4bbcab-55cd-4c14-a106-6d74bf6103e9` were **stopped** (loop halted; no more spend).
- **Visualizer:** feed server on `http://localhost:4000`
  (`SESSION=3c4bbcab-55cd-4c14-a106-6d74bf6103e9`, `MARKET_SELLERS=seller-a11y,seller-a11y-pro`,
  `PORT=4000`); Vite web on `http://localhost:5173`. Open
  `http://localhost:5173/?session=3c4bbcab-55cd-4c14-a106-6d74bf6103e9` (or paste the session id into the
  UI box). The feed replays the recorded run ledger even with agents stopped.

## How to reproduce a live run (from `accessguard/coralos-ts`)

```sh
node scripts/setup.js                 # wallets + .env; then fund the buyer at faucet.solana.com
# add VENICE_API_KEY=... and LLM_PROVIDER=venice to .env
docker compose up -d coral
bash build-agents.sh                  # Windows CRLF can break this script - run the docker builds directly if so
docker build -f coral-agents/verifier-agent/Dockerfile -t verifier-agent:0.1.0 .
npm run accessguard                   # direct settlement by default; auto rent-exempts the seller
```

Visualizer (PowerShell env syntax):

```powershell
$env:SESSION='<id>'; $env:MARKET_SELLERS='seller-a11y,seller-a11y-pro'; $env:PORT='4000'; npm run accessguard:feed
npm run accessguard:web               # then open http://localhost:5173/?session=<id>
```

## Known caveats / possible next steps

- **Windows/PowerShell:** set env vars PowerShell-style (`$env:X='...'; npm run ...`), not
  `X=... npm run ...`. `build-agents.sh` has CRLF issues.
- **Arbiter mode** is only usable if you deploy your own `arbiter` program and hold its `config` key;
  otherwise use the `direct` default.
- **The market loop runs forever** (`while true`, ~30s cycle) until containers are stopped — it slowly
  spends devnet SOL.
- **Rotate the exposed Venice API key.**
- Follow-ups: demo video, finalize submission materials, and (optional) make the arbiter path forkable
  (deploy-your-own-config flow).
