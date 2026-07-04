"""Escrow + settlement for the accessibility bounty marketplace.

The *economic logic* is fully implemented and deterministic: a requester escrows a
per-violation bounty, and funds are released only when the verifier accepts a fix.
This is what makes the market trustless — payout is a pure function of an objective
verdict, never a self-attestation.

The on-chain layer targets **Solana** (required by the CoralOS / STUK track) and is
injected as a `settler` (see `chain/solana_client.py`): a `MockSettler` by default so
the market runs offline, or a real `SolanaSettler` on devnet when configured.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from engine.types import Bounty
from chain.solana_client import MockSettler


@dataclass
class LedgerEntry:
    tx: str
    bounty_key: str
    to_agent: str
    amount: int
    memo: str


@dataclass
class Escrow:
    """Holds requester funds and releases them on verified fixes."""

    requester: str
    cluster: str = "devnet"
    settler: Any = None            # a MockSettler / SolanaSettler; injected
    _locked: int = 0
    bounties: dict[str, Bounty] = field(default_factory=dict)
    ledger: list[LedgerEntry] = field(default_factory=list)

    def __post_init__(self):
        if self.settler is None:
            self.settler = MockSettler(self.cluster)
        # keep the reported cluster consistent with the settler in use
        self.cluster = getattr(self.settler, "cluster", self.cluster)

    # -- funding --------------------------------------------------------------
    def open_bounty(self, bounty: Bounty) -> None:
        self.bounties[bounty.violation_key] = bounty
        self._locked += bounty.amount

    @property
    def locked(self) -> int:
        return self._locked

    # -- settlement -----------------------------------------------------------
    def release(self, violation_key: str, to_agent: str, memo: str) -> LedgerEntry | None:
        """Pay out a bounty to the winning agent. Idempotent per bounty."""
        b = self.bounties.get(violation_key)
        if b is None or b.status != "open":
            return None
        tx = self._transfer(to_agent, b.amount, memo)
        b.status = "paid"
        b.winner = to_agent
        self._locked -= b.amount
        entry = LedgerEntry(tx=tx, bounty_key=violation_key, to_agent=to_agent,
                            amount=b.amount, memo=memo)
        self.ledger.append(entry)
        return entry

    def refund_unclaimed(self) -> int:
        """Return still-open bounties to the requester (e.g. no valid fix arrived)."""
        refunded = 0
        for b in self.bounties.values():
            if b.status == "open":
                b.status = "expired"
                refunded += b.amount
                self._locked -= b.amount
        return refunded

    # -- on-chain boundary ----------------------------------------------------
    def _transfer(self, to_agent: str, amount: int, memo: str) -> str:
        """Move `amount` from escrow to `to_agent` via the injected settler.

        Delegates to a `MockSettler` (offline) or a real `SolanaSettler` (devnet).
        """
        return self.settler.transfer(to_agent, amount, memo)

    # -- reporting ------------------------------------------------------------
    def summary(self) -> dict:
        paid = [b for b in self.bounties.values() if b.status == "paid"]
        return {
            "cluster": self.cluster,
            "settlement_mode": getattr(self.settler, "mode", "mock"),
            "requester": self.requester,
            "bounties_total": len(self.bounties),
            "bounties_paid": len(paid),
            "amount_paid": sum(e.amount for e in self.ledger),
            "amount_locked_remaining": self._locked,
        }
