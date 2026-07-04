# AccessGuard — agents that get paid to make the web accessible

**One idea, two runnable submissions, one shared deterministic oracle.**

Site owners (councils, grant programs, product teams) post a page that fails WCAG. Independent
accessibility agents *compete* to fix it, a neutral *verifier* re-audits the delivery, and payment
settles on **Solana only for fixes that provably work** — no LLM-as-judge, no self-attestation.

The trust anchor in both submissions is the same thing: a **deterministic WCAG 2.2 engine**. Because
acceptance is an objective, reproducible re-audit (not a subjective opinion), any party can verify a
payout and it holds up under dispute.

## This repo

| Path | Track | Stack | Run without chain? |
|------|-------|-------|--------------------|
| [`gcc-python/`](gcc-python/) | GCC & ETH **"AI for Good"** + reference economy | Python (stdlib-first) | Yes — `demo.py` / MCP server / web UI |
| [`coralos-ts/`](coralos-ts/) | CoralOS & STUK **"Build the Agent Economy"** ($5k) | TypeScript, devnet escrow, coral-server MCP | No — real devnet settlement |

Both are **independently runnable** and share no build system on purpose — each stands alone for its
judges. What they share is the *design*: the WCAG engine is the oracle, and a re-audit gate binds the
money to a measurable accessibility improvement.

## The two forms of the same economy

- **`gcc-python/` (AccessGuard Exchange)** — the self-contained reference implementation. A crew of
  MCP agents (`audit`, `remediate`, `verify`, `settle`) runs the whole marketplace loop locally; the
  deterministic engine (`engine/wcag.py`) is the trustless referee. This is the AI-for-Good / Digital
  Commons story: pro-bono audits for under-resourced civic sites, CJK-aware (Simplified vs Traditional
  `lang` disambiguation included).

- **`coralos-ts/` (CoralOS fork)** — the same idea forked onto the official
  [`solana_coralOS`](https://github.com/trilltino/solana_coralOS) starter kit. The WCAG engine is
  ported to TypeScript (`packages/agent-runtime/src/wcag`) and exposed as the seller's
  `deliverService()`; the deterministic re-audit becomes the market's neutral **verifier gate**; and a
  buyer awards best value, escrows on devnet, and releases **only** on a verified, regression-free fix.
  See [`coralos-ts/examples/accessguard/`](coralos-ts/examples/accessguard/).

## Quick start

**GCC (Python, no chain):**
```sh
cd gcc-python
python demo.py                    # deterministic audit → remediate → re-audit on bundled fixtures
```

**CoralOS (TypeScript, devnet):**
```sh
cd coralos-ts
node scripts/setup.js             # wallets + .env; add VENICE_API_KEY (+ fund the buyer wallet)
docker compose up -d coral
bash build-agents.sh              # buyer + seller + verifier images
npm run accessguard               # WANT → BIDs → AWARD → escrow → DELIVERED → VERIFIED → release
```

Watch the CoralOS market in a browser (read-only, shows the WCAG score jump + on-chain settlement):
```sh
cd coralos-ts
SESSION=<session-id> MARKET_SELLERS=seller-a11y,seller-a11y-pro npm run accessguard:feed
npm run accessguard:web           # open http://localhost:5173/?session=<session-id>
```

## Why it's different

Most agent marketplaces pay a winner chosen by an **LLM-as-judge** — a subjective oracle you must
trust. AccessGuard replaces that with a **deterministic re-audit**: the same engine that found the
violations re-checks the delivered fix. No improvement, or a regression, means **no pay** — and the
funds stay refundable. The impact is measurable (a WCAG score gain on a real public-service page) and
the proof is on-chain.

## License

MIT — fork, reuse, extend.
