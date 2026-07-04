"""Solana settlement — pay verified accessibility fixes on devnet.

Two settlers share one interface (`transfer(agent, amount, memo) -> signature`):

  * `MockSettler`   — deterministic fake signatures; the default, so the whole
                      marketplace runs offline with an inspectable ledger.
  * `SolanaSettler` — a real SystemProgram transfer on Solana devnet, signed by a
                      funded payer keypair, with an on-chain memo. Degrades to a mock
                      signature on any error so a flaky RPC never breaks a demo.

Turn on the real chain with environment variables:

    AGX_SOLANA_LIVE=1
    AGX_SOLANA_CLUSTER=devnet                     # or testnet / mainnet-beta
    AGX_PAYER_SECRET=[12,34,...]                  # Solana CLI keypair json array
                                                  #   (or a base58 secret key string)
    AGX_AGENT_WALLETS={"acme-a11y":"<pubkey>", ...}

Fund the payer once:  `solana airdrop 1 <payer-pubkey> --url devnet`
The `solders` + `solana` packages are imported lazily, so they are only required
when the live path is actually used.
"""

from __future__ import annotations

import json
import os

# 1 accounting unit -> lamports (0.00001 SOL). 220 units ~= 0.0022 SOL — trivial on devnet.
LAMPORTS_PER_UNIT = 10_000
MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"


class SettlementError(Exception):
    pass


class MockSettler:
    mode = "mock"

    def __init__(self, cluster: str = "devnet"):
        self.cluster = cluster
        self._seq = 0

    def transfer(self, agent: str, amount: int, memo: str) -> str:
        self._seq += 1
        return f"mock-sol-tx-{self.cluster}-{self._seq:04d}"


class SolanaSettler:
    """Real devnet transfer. Falls back to a mock signature on any failure."""

    mode = "live"

    def __init__(self, cluster: str, payer, wallets: dict[str, str], log=print):
        self.cluster = cluster
        self.wallets = wallets
        self.log = log
        self._payer = payer
        self._fallback = MockSettler(cluster)
        # imported lazily in _connect()
        self._client = None

    def _connect(self):
        if self._client is None:
            from solana.rpc.api import Client  # lazy
            self._client = Client(f"https://api.{self.cluster}.solana.com")
        return self._client

    def transfer(self, agent: str, amount: int, memo: str) -> str:
        try:
            return self._transfer_live(agent, amount, memo)
        except Exception as e:  # never let settlement crash the market
            self.log(f"    [chain] live transfer failed ({e}); using mock signature")
            return self._fallback.transfer(agent, amount, memo)

    def _transfer_live(self, agent: str, amount: int, memo: str) -> str:
        from solders.pubkey import Pubkey
        from solders.system_program import transfer, TransferParams
        from solders.instruction import Instruction, AccountMeta
        from solders.message import Message
        from solders.transaction import Transaction

        to = self.wallets.get(agent)
        if not to:
            raise SettlementError(f"no wallet configured for agent {agent!r}")

        payer_pk = self._payer.pubkey()
        to_pk = Pubkey.from_string(to)
        lamports = amount * LAMPORTS_PER_UNIT

        ixs = [transfer(TransferParams(from_pubkey=payer_pk, to_pubkey=to_pk, lamports=lamports))]
        # attach the memo so the payout reason is on-chain
        ixs.append(Instruction(
            program_id=Pubkey.from_string(MEMO_PROGRAM_ID),
            accounts=[AccountMeta(pubkey=payer_pk, is_signer=True, is_writable=False)],
            data=memo.encode("utf-8"),
        ))

        client = self._connect()
        blockhash = client.get_latest_blockhash().value.blockhash
        msg = Message.new_with_blockhash(ixs, payer_pk, blockhash)
        tx = Transaction([self._payer], msg, blockhash)
        sig = client.send_transaction(tx).value
        return str(sig)


def _load_payer():
    """Build a solders Keypair from AGX_PAYER_SECRET (json array or base58)."""
    secret = os.environ.get("AGX_PAYER_SECRET", "").strip()
    if not secret:
        raise SettlementError("AGX_PAYER_SECRET is not set")
    from solders.keypair import Keypair
    if secret.startswith("["):
        return Keypair.from_bytes(bytes(json.loads(secret)))
    return Keypair.from_base58_string(secret)


def make_settler(cluster: str | None = None, wallets: dict[str, str] | None = None, log=print):
    """Return a live SolanaSettler when configured, else a MockSettler."""
    cluster = cluster or os.environ.get("AGX_SOLANA_CLUSTER", "devnet")
    if os.environ.get("AGX_SOLANA_LIVE", "").lower() not in ("1", "true", "yes"):
        return MockSettler(cluster)
    try:
        payer = _load_payer()
        wallets = wallets or json.loads(os.environ.get("AGX_AGENT_WALLETS", "{}"))
        settler = SolanaSettler(cluster, payer, wallets, log=log)
        log(f"[chain] live Solana settlement on {cluster} (payer {payer.pubkey()})")
        return settler
    except Exception as e:
        log(f"[chain] live settlement unavailable ({e}); falling back to mock")
        return MockSettler(cluster)
