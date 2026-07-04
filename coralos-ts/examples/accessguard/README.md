# AccessGuard market — agents that get paid to make public services accessible

A buyer (a council / grant program / site owner) posts a page that fails WCAG. Accessibility
**seller agents compete** to fix it. The winner remediates the page and delivers the fixed HTML.
An **independent, deterministic verifier re-audits** the delivery, and only a real, regression-free
improvement releases the Solana escrow. No fix, no pay.

```
WANT accessguard <page>              buyer broadcasts the job (a page to fix)
  ├─ BID (seller-a11y)               generalist fixer — cheap, whole-ruleset
  └─ BID (seller-a11y-pro)           premium specialist — audit-grade, pricier
AWARD → ESCROW_REQUIRED → DEPOSITED  funds lock on devnet
  the winner remediates (deterministic WCAG engine) → DELIVERED <hash-bound fixed HTML>
VERIFY → VERIFIED pass|fail          independent RE-AUDIT: fix real? regressions? (no LLM opinion)
RELEASED (on-chain) | funds stay refundable
```

**Why this is different from the default demo:** the verifier's acceptance is not an LLM judge —
it is the same deterministic WCAG engine (`packages/agent-runtime/src/wcag`), re-run on the delivered
HTML. The payout is bound to an **objective, reproducible** improvement, so it holds up under dispute.

## The fork, in three edits (as the kit intends)

- **The service** — `accessguard` in [`coral-agents/seller-agent/src/service.ts`](../../coral-agents/seller-agent/src/service.ts):
  `deliverService()` returns `{ fixed: <WCAG-repaired HTML>, resolved: [...] }`.
- **The sellers** — personas [`coral-agents/seller-a11y`](../../coral-agents/seller-a11y) and
  [`coral-agents/seller-a11y-pro`](../../coral-agents/seller-a11y-pro) (reuse the `seller-agent` image; `SERVICES=accessguard`).
- **The buyer's criteria** — best **value** (score-gain per SOL) within a code-enforced budget
  (`BUYER_SERVICE=accessguard`, `VERIFIER_AGENT=verifier-agent`).

Plus one addition the kit is built for: the verifier's domain gate in
[`coral-agents/verifier-agent/src/verify.ts`](../../coral-agents/verifier-agent/src/verify.ts).

## Run it (devnet, end-to-end)

Needs Docker (coral-server) + a funded devnet buyer wallet + an LLM key (Venice AI has free
hackathon credits — redeem code `IMPERIAL50`, see [`LLM.md`](../../LLM.md)).

```sh
# 0. one-time: wallets + .env, then fund the buyer at faucet.solana.com (GitHub sign-in)
node scripts/setup.js
#    add VENICE_API_KEY=... and LLM_PROVIDER=venice to the generated .env

# 1. build the agent images (bundles the new WCAG engine + accessguard service)
docker compose up -d coral
bash build-agents.sh                                                    # buyer + seller + verifier
docker build -f coral-agents/verifier-agent/Dockerfile -t verifier-agent:0.1.0 .

# 2. run the market
npm run accessguard                                                     # from the repo root
```

Watch the settlement happen:

```sh
docker logs -f buyer-agent      # WANT → AWARD → DEPOSITED → verified → RELEASED
docker logs -f seller-a11y      # BID → ESCROW_REQUIRED → DELIVERED (WCAG-fixed HTML)
docker logs -f verifier-agent   # VERIFY in → deterministic WCAG verdict out
```

Every round lands in `examples/marketplace/runs/` — bids, award reasoning, `delivery.json`
(sha256-bound), `verification.json`, and **Explorer-linked settlement txs**. That release tx is the
proof: an agent decided to pay another agent for a verified accessibility fix, on-chain.

## Settlement

Defaults to **`direct`** base-escrow settlement (`R5NW…`): the buyer deposits into a per-order escrow
PDA, then signs `release` **only** after the independent verifier returns `pass` (the release is gated
by the buyer's policy — `enforce({ kind: 'release', verified }, policy)`). No pass, no payout; funds stay
refundable after the deadline.

- **Auto rent-exemption.** `release` credits the seller wallet directly, so `npm run accessguard`
  first tops the seller up to the rent-exempt minimum (a one-time transfer from the funded buyer) —
  otherwise sub-rent bid amounts fail with `InsufficientFundsForRent`. Subsequent runs skip it.
- **Arbiter mode** (`SETTLEMENT_MODE=arbiter`) routes release through the neutral third-signer
  `arbiter` program instead. Its `config` PDA is a global singleton already claimed on the shared
  devnet deployment, so use it only if you deploy your own arbiter program and hold its config key.

## Watch it in the browser (visualizer)

The read-only React board (no wallet) renders each round's bids, the winning reasoning, and the
settlement — and shows the **WCAG score jump** (e.g. `42 → 100`) with the fixes applied, so the
moment the page becomes accessible and the escrow releases is visible at a glance.

```sh
# 1. feed server on :4000 — point it at the accessguard session id printed by `npm run accessguard`
SESSION=<session-id> MARKET_SELLERS=seller-a11y,seller-a11y-pro npm run accessguard:feed
# 2. the UI on :5173 (another shell) — then open http://localhost:5173/?session=<session-id>
npm run accessguard:web
```

The feed replays finished rounds from the run ledger even with coral-server down, so the score jump
and the Explorer-linked release stay inspectable after the demo. The accessibility panel is
e2e-tested with fixtures (`examples/marketplace/web`).

## Pages to fix

`ACCESSGUARD_PAGES` is a CSV of single tokens — bundled fixture keys or `http(s)` URLs:

```sh
# bundled local-government fixtures (default)
ACCESSGUARD_PAGES=council-parking,nhs-appointment,tax-portal npm run accessguard
# or point at a live page
ACCESSGUARD_PAGES=https://example.gov/services npm run accessguard
```

## The no-pay path is a feature

Flip the generalist into a no-op and watch the escrow refuse to release:

```sh
ACCESSGUARD_LAZY=1 npm run accessguard   # seller-a11y returns the page UNCHANGED
```

The verifier re-audits, sees **no violation resolved**, returns `fail`, and the funds stay
refundable. A seller that *breaks* the page (introduces a new violation) is rejected the same way —
verified locally:

```
HAPPY   resolved 6 violation(s), score 0->100, no regressions   → pass
LAZY    no violations resolved                                  → fail (refund)
TAMPER  introduced 1 new violation(s)                           → fail (refund)
```

## Impact framing (for the pitch)

- **The customer:** software — a council/grant agent that wants pages compliant, bidding a budget.
- **What it sells:** `deliverService()` returns WCAG-fixed HTML for a named page.
- **Why they pay:** accessibility compliance = disabled citizens can actually use public services;
  the score gain is the measurable, counterfactual impact the escrow is bound to.
- **The economy:** a buyer + competing seller personas + a paid, neutral verifier oracle — a graph.
- **Proof:** the release tx on Solana Explorer, bound (sha256) to a delivery the verifier accepted.

## Sustainable growth (GCC)

On the healthy side of the revenue–evil curve: public bodies pay only for **verified** accessibility
gains, and a share of settlement reinvests into the open-source WCAG engine and **pro-bono audits**
for under-resourced civic sites — prioritising Chinese-speaking public services. The engine is
**CJK-aware** (the `city-services-zh` fixture shows a Chinese page whose `lang="en"` mismatch is
caught and repaired), and it disambiguates Simplified vs Traditional — repairing to `lang="zh-Hans"`
or `lang="zh-Hant"` from the script actually used — so the commons it serves explicitly includes the
zh world.
