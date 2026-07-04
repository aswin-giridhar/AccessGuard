# examples

Five views of the same rails — **WANT → BID → AWARD → DEPOSITED → DELIVERED → (VERIFIED) → RELEASED**
on Solana devnet. Fork the `deliverService()` in any of them to sell your own thing; the World Cup
service is only the default demo.

- **[txodds/](txodds/README.md)** — **the default demo (start here).** One agent sells a verified odds
  read and the escrow auto-settles on delivery. `npm run dev` (from the repo root) brings up the proxy +
  the React board — no Docker. Fastest way to see the rails; swap its `deliverService()`
  ([`agent/service.ts`](txodds/agent/service.ts)) and you're selling your own service.

- **[marketplace/](marketplace/README.md)** — **the full market.** LLM seller agents compete in a shared
  CoralOS thread; the buyer awards best value and settles via the escrow contract. Includes a React
  market visualizer, and its `feed/` writes every round to the **run ledger** (`runs/` —
  `/api/runs` + `/api/reputation`, replayable with coral down). Needs Docker.

- **[freelancer/](freelancer/README.md)** — **heterogeneous harnesses compete for paid work.** A plain
  LLM seller vs a headless **Claude Code** seller bid on a brief; an independent **verifier** checks the
  hash-bound delivery and only a pass releases the arbiter escrow. Validated live on devnet — both the
  settle path and the refuse path. Needs Docker.

- **[research/](research/README.md)** — **events trigger the market.** A watcher diffs the live odds
  board and queues a WANT only when a line actually moves; specialist personas compete on the verified
  read. Quiet board, no spend. Needs Docker + the txodds proxy.

- **[agent-economy/](agent-economy/README.md)** — **three front doors** on CoralOS: autonomous
  (agent→agent), a human checkout (Phantom/Solflare wallet), and a bare 402 pay-per-call quickstart. All
  settle in devnet SOL. Needs Docker.

Full pitch + quick start in the [root README](../README.md).
