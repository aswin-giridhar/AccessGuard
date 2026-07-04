# AccessGuard Exchange

**A zero-trust agent economy that makes the web accessible — and pays only for fixes that provably work.**

> 中文说明见 [`README.zh.md`](README.zh.md)。

Site owners post an accessibility bounty on a URL. A crew of independent agents *audits* it against
WCAG 2.2, *competes* to remediate the violations, and a neutral *verifier* re-tests the patched page.
Payment settles on Solana **only** to the agents whose fixes pass an objective re-audit — no trust,
no self-attestation, no humans rubber-stamping.

Built for the **CoralOS & STUK "Build the Agent Economy"** track — UK AI Agent Hackathon EP5.

> **Two runnable forms.** This Python project is the self-contained reference economy + GCC "AI for
> Good" submission. For the **CoralOS track**, the same idea is forked onto the official
> `solana_coralOS` starter kit — the WCAG engine is ported to TypeScript as the seller's
> `deliverService()`, and the deterministic re-audit becomes the market's neutral **verifier gate**
> with real devnet escrow settlement. See [`../coralos-ts/examples/accessguard/`](../coralos-ts/examples/accessguard/).

- **CoralOS / STUK (primary, 5,000 USDT)** — a real multi-agent economy: supply, demand, competition, verified on-chain settlement.
- **GCC & ETH "AI for Good" (1,000 USDT)** — agents making real allocation decisions with civic / digital-rights impact.
- **Fetch.ai ASI:One (optional, 1,000 USDT)** — a conversational entry point ("audit my site").

---

## Why it's different (vs. the crowded Coral lane)

The Coral economy lane is full of *generic* marketplaces (AI Agent Swarm, RugGuard, KOANE,
Pay-Per-UseAI). They pay a "winner" chosen by an **LLM-as-judge** — a subjective oracle you have to trust.

AccessGuard Exchange settles on an **objective, deterministic oracle**: a WCAG audit engine that returns
the *same* pass/fail for the *same* HTML every time. A remediation agent gets paid **iff** the specific
violation it claimed is gone **and** it introduced no new violations. The economy is trustless because
the referee is code, not a model.

- **Verifiable work, not vibes.** Payout is gated on a re-runnable audit, not an LLM's opinion.
- **Real civic payload.** Inaccessible public/government sites lock disabled citizens out of services.
- **Zero-trust coordination.** Agents don't trust each other; escrow + the deterministic verifier enforce honesty.

---

## The marketplace loop

```
Requester posts URL + bounty (escrowed on Solana)
        │
        ▼
[Audit Agent]  ── crawls + runs the WCAG engine ──▶  list of violations, each with a bounty weight
        │
        ▼
[Remediation Agents]  ── compete: each proposes a patch for one or more violations
        │
        ▼
[Verification Agent]  ── applies patch to a copy, RE-AUDITS objectively:
        │                   fix accepted iff  (claimed violation gone) AND (no new violations)
        ▼
[Settlement]  ── escrow releases the per-violation bounty to the winning agent on Solana
```

Each capability is exposed as an **MCP tool** (`audit`, `remediate`, `verify`, `settle`) so the crew is
framework-agnostic and composable under CoralOS.

## Architecture

```
gcc-python/
  engine/
    types.py        Violation / AuditReport / Patch / Bounty dataclasses
    wcag.py         DETERMINISTIC WCAG 2.2 audit engine (the objective oracle)
    remediate.py    patch generation per violation type
    verify.py       apply patch → re-audit → accept/reject (the trustless referee)
    fetch.py        live-URL crawler (stdlib only)
  agents/
    orchestrator.py CoralOS-style coordinator running the marketplace loop
    audit_agent.py       wraps engine.wcag as an agent capability
    crawl_agent.py       fetches a live URL for auditing
    remediation_agent.py competing fixer agents (skill niches)
    verification_agent.py neutral referee agent
    settlement.py        escrow; releases bounties via an injected settler
  chain/
    solana_client.py MockSettler (offline) + real SolanaSettler (devnet) + factory
  coral/
    agent-manifest.json  CoralOS registration manifest (runtime + skills + settlement)
    README.md            how to register the crew on CoralOS
  web/
    server.py       FastAPI backend for the visual demo
    index.html      single-page marketplace UI
  samples/
    inaccessible.html    a demo page with known, seeded violations
  mcp_server.py     MCP server exposing crawl/audit/remediate/verify/run_marketplace
  demo.py           end-to-end marketplace run (offline, local file, or live URL)
```

The **core (engine/) is deterministic** and needs no network, chain, or model — the demo cannot fail on a
flaky RPC or LLM. The CoralOS orchestration and Solana settlement are integration layers on top of this
grounded core (the same philosophy that made our sibling project robust).

## Run it

```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

**CLI demo** (offline, a local file, or a live URL — the crawler is stdlib-only):

```bash
python demo.py                       # bundled sample (10 seeded violations)
python demo.py path/to/page.html     # any local HTML file
python demo.py https://example.gov   # crawl a LIVE page, then run the market
```

**Web UI** (visual marketplace):

```bash
pip install -r requirements-web.txt
python -m uvicorn web.server:app --port 8000     # open http://localhost:8000
```

**MCP server / CoralOS** (publish the crew as MCP tools — see `coral/README.md`):

```bash
pip install -r requirements-mcp.txt
python mcp_server.py                              # stdio transport
```

**Live Solana devnet settlement** (optional; mock is the default):

```bash
pip install -r requirements-solana.txt
set AGX_SOLANA_LIVE=1
set AGX_PAYER_SECRET=[.. keypair json ..]
set AGX_AGENT_WALLETS={"acme-a11y":"<pubkey>"}
solana airdrop 1 <payer-pubkey> --url devnet
python demo.py                                     # payouts now hit real devnet
```

## Bounty rubric mapping

### CoralOS & STUK — Build the Agent Economy (primary)
- [x] **Multi-agent economy** — requester, audit, N competing remediators, verifier, treasury.
- [x] **Real settlement** — per-violation bounties escrowed and released on verified work (Solana).
- [x] **Zero-trust** — deterministic verifier + escrow; agents never self-certify.
- [x] **MCP-native / composable** — capabilities exposed as MCP tools (`mcp_server.py`); framework-agnostic.
- [x] **Solana settlement** — real devnet `SolanaSettler` (SystemProgram transfer + on-chain memo), mock by default.

### GCC & ETH — Category 1: Optimizing Agent Workflows for Public Funding Distribution
Read the requester as a **public funder** — a council, agency, or grant program with a budget to
allocate toward accessible public services. AccessGuard is a reusable workflow for how that capital is
**sourced, evaluated, allocated, and measured**:
- [x] **Sourced & allocated** — the funder escrows a budget and releases it *per fix, only on verified
  delivery* (`agents/settlement.py`); no upfront payment, no self-attestation.
- [x] **Evaluated** — remediation agents *compete* per violation and the bounty goes to the **first patch
  that passes the deterministic verifier** — verified work wins, not lowest price or an LLM's opinion.
  (The CoralOS fork extends selection with reputation-weighted best-value bidding.)
- [x] **Measured** — every settlement records a WCAG **score before → after**, so each unit of public
  money maps to a concrete, auditable accessibility gain.
- [x] **Justified metrics, not a gameable proxy:**
  - *Impact estimate* — the accessibility **score** (`100 − Σ per-rule weights`, `engine/types.py` `RULE_WEIGHTS` / `AuditReport.score`).
  - *Counterfactual* — payout is bound to the `before → after` delta; a no-op page, or one that *loses*
    the fix, earns nothing (`engine/verify.py`).
  - *Milestone verification* — a neutral verifier re-audits the delivered artifact against the same
    engine before any release (`agents/verification_agent.py`).
- [x] **Adoptable components other grant programs can fork:**
  - *Portable rubric* — the per-violation weight table `RULE_WEIGHTS` (`engine/types.py`) is a
    standalone, documented scoring rubric, decoupled from the agents.
  - *Standard interface* — every capability is an **MCP tool** (`crawl`/`audit`/`remediate`/`verify`/`run_marketplace`),
    framework-agnostic and host-agnostic.
  - *Modular workflow* — audit → remediate → verify → settle are separable stages; swap the rubric,
    the crawler, or the settler without touching the economy.

### GCC & ETH — Category 2: AI for Good
- [x] **Real allocation decision** — capital routed to whoever objectively improves accessibility.
- [x] **Civic / digital-rights impact** — WCAG compliance = access to public services for disabled users.
- [x] **Transparent, reusable** — deterministic rubric, open source, forkable.

### GCC — Digital Commons for the Chinese-speaking world
- [x] **Serves the zh commons** — CJK-aware `html-lang` check flags Chinese pages that declare the wrong
  language (a common real barrier for zh screen-reader users); `zh` fixtures + `README.zh.md`.
- [x] **Defines a public problem** — inaccessible public-sector sites lock disabled citizens out of services.
- [x] **New paradigm** — funding bound to a deterministic oracle, not an LLM judge or human rubber-stamp.

## Sustainable growth

GCC funds public goods that can sustain themselves and reinvest in the commons (cf. Vitalik's
revenue–evil curve). AccessGuard's model is deliberately on the healthy side of that curve:

- **Who pays** — public bodies / site owners fund per-violation bounties for work that is *verified*,
  not merely claimed. They pay only for measurable accessibility gains.
- **Reinvest in the commons** — a share of settlement funds the **open-source WCAG engine** and
  **pro-bono audits** for under-resourced civic sites (prioritising Chinese-speaking public services).
- **Non-extractive** — the engine, rubric, and agents are MIT and forkable; there is no rent-seeking
  gatekeeper, because the referee is public, deterministic code.

## Scope & honesty

- The bundled WCAG engine covers a **focused, high-impact subset** of WCAG 2.2 AA (alt text, contrast,
  form labels, accessible names, document language/title, heading order). It is real and re-runnable; the
  same engine scales to the full ruleset (or an axe-core backend) without changing the economy.
- The `html-lang` check is **CJK-aware**: it flags a Chinese-dominant page that is missing `lang` or
  declares a non-`zh` language, and remediation sets the correct `lang`. Simplified vs Traditional is
  **disambiguated deterministically** — `zh-Hans` / `zh-Hant` (or `zh` when a page genuinely mixes both)
  via script-exclusive character sets, no model and no guessing (`engine/wcag.py` `_detect_zh_variant`).
  See `samples/inaccessible-zh.html` (Traditional) and `samples/inaccessible-zh-hans.html` (Simplified).
- Solana settlement runs **offline by default** (deterministic mock signatures); the real devnet path is
  fully implemented (`chain/solana_client.py`) and enabled with `AGX_SOLANA_LIVE=1` + a funded keypair.
  On any RPC error it degrades to a mock signature so a demo never breaks.
- The CoralOS registration maps the crew onto CoralOS's MCP + Solana model; the exact registry schema may
  evolve, so `coral/agent-manifest.json` is structured to match the starter-kit and is easy to adjust.
