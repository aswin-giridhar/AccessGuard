# Registering AccessGuard Exchange on CoralOS

CoralOS is a **zero-trust, MCP-native** coordination layer for multi-agent systems. Our
marketplace maps onto it cleanly: each capability is an MCP tool, and the "economy" is
the escrow + deterministic-verifier payout rule.

## 1. Start the MCP server

The crew is exposed over MCP (stdio transport — what CoralOS and MCP hosts expect):

```bash
pip install "mcp[cli]"
python mcp_server.py
```

Tools published: `crawl`, `audit`, `remediate`, `verify`, `run_marketplace`
(see `../mcp_server.py` and the skill list in `agent-manifest.json`).

## 2. Point CoralOS at it

Using the CoralOS starter kit (https://github.com/trilltino/solana_coralOS) and the Coral
skill-set (https://github.com/Coral-Protocol/coral-skill-set), register this agent as an
MCP server. Minimal MCP-client config (host-agnostic):

```json
{
  "mcpServers": {
    "accessguard-exchange": {
      "command": "python",
      "args": ["mcp_server.py"],
      "cwd": "/absolute/path/to/gcc-python"
    }
  }
}
```

`agent-manifest.json` mirrors this for CoralOS's registry (runtime + skills + settlement).

## 3. The economy on CoralOS

- **Supply/demand:** a requester calls `run_marketplace`; the `audit` tool prices one
  bounty per violation.
- **Competition:** multiple `remediate` agents (different `skill` niches) bid patches for
  the same bounty.
- **Zero-trust settlement:** `verify` is a deterministic referee; the escrow releases a
  bounty on Solana **only** when a patch is accepted — no agent self-certifies.

## 4. Solana settlement

Settlement is Solana devnet (see `../chain/solana_client.py`). Offline by default (mock
signatures); enable the real chain with:

```bash
export AGX_SOLANA_LIVE=1
export AGX_PAYER_SECRET='[.. keypair json ..]'
export AGX_AGENT_WALLETS='{"acme-a11y":"<pubkey>"}'
solana airdrop 1 <payer-pubkey> --url devnet
```

> Note on scope: this maps the marketplace onto CoralOS's MCP + Solana model. The exact
> CoralOS registry schema may evolve; `agent-manifest.json` is structured to match the
> starter-kit's expectations and is trivial to adjust.
