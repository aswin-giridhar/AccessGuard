# coral-agents

Dockerized agents coral-server launches per session — for the TxODDS round
([`examples/txodds/coral/`](../examples/txodds/coral)), the marketplace, the freelancer market, and the
research market. Each agent connects to a CoralOS MCP session through `startCoralAgent` and trades in a
shared market thread. **Agents hold the keys and run the checks; harnesses only produce artifacts.**

| Agent | Role |
|---|---|
| `buyer-agent` | Broadcasts `WANT` (or polls a `WANT_FEED_URL` in event mode), collects competing bids, awards best value (weighing ledger-derived reputation via `REPUTATION_URL`), opens arbiter escrow, and routes **every deposit and release through the policy choke point** (`POLICY_*`). With `VERIFIER_AGENT` set, release is gated on a `VERIFIED pass`. |
| `seller-agent` | The seller image. Bids with code-enforced economics and delivers through a **harness adapter** (`HARNESS=node-llm` default, `claude-code`, or any `cli` — see [`packages/harness-runtime`](../packages/harness-runtime)); verifies the funded escrow before delivering. `Dockerfile.claude` bakes the Claude Code CLI in. |
| `verifier-agent` | The independent release gate: re-checks the delivery's content hash + structure (plus an optional LLM acceptance judge) and replies `VERIFIED pass\|fail`. Holds no keys, moves no funds. |
| `broker` | Swarm reseller — buys upstream from the real sellers, resells at a markup, escrow on both legs. |
| `echo-agent` | Minimal MCP connectivity gate (echoes a mention). |
| `user_proxy` | The human's puppet for the agent-economy bridge. |

**Personas** (a `coral-agent.toml` reusing the seller image — different `AGENT_NAME`/`PERSONA`/`FLOOR_SOL`/
`SERVICES`/`HARNESS`, no code): `seller-worldcup` (the oracle), `seller-scribe` (freelance baseline),
`seller-claude` (freelance via the Claude Code harness, `seller-agent-claude:0.1.0`), `seller-moves` +
`seller-stats` (research specialists).

Settlement is arbiter-gated by default: the buyer funds a vault PDA, the seller verifies that
vault-backed escrow, and the neutral arbiter key releases payment after delivery — after the verifier
says pass, when one is in session.

## Build

```sh
bash build-agents.sh            # seller + buyer + verifier images
bash build-agents.sh claude     # + the Claude Code seller image (seller-agent-claude:0.1.0)
```

The round launchers instantiate personas from these images with different options — see
[`examples/marketplace/start.ts`](../examples/marketplace/start.ts),
[`examples/freelancer/start.ts`](../examples/freelancer/start.ts), and
[`examples/research/start.ts`](../examples/research/start.ts).
