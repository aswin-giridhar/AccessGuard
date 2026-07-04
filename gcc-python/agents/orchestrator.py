"""Orchestrator — the CoralOS-style coordinator for the accessibility bounty market.

It wires the crew together and runs the trustless loop:

    audit → escrow a bounty per violation → let remediation agents compete →
    verify each candidate objectively → release the bounty to the first valid fix →
    re-audit and repeat until the page is clean or no agent can make progress.

Nothing here trusts an agent's word: a bounty is paid only after the deterministic
verifier confirms the claimed violation is gone with no regressions.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from engine.types import AuditReport, Bounty
from chain.solana_client import make_settler
from .audit_agent import AuditAgent
from .remediation_agent import RemediationAgent
from .verification_agent import VerificationAgent
from .settlement import Escrow, LedgerEntry


@dataclass
class Award:
    violation_key: str
    rule: str
    winner: str
    amount: int
    tx: str
    verdict: str
    before_score: int
    after_score: int


@dataclass
class MarketResult:
    baseline: AuditReport
    final: AuditReport
    awards: list[Award] = field(default_factory=list)
    escrow_summary: dict = field(default_factory=dict)
    rounds: int = 0
    refunded: int = 0


class Orchestrator:
    def __init__(
        self,
        remediators: list[RemediationAgent],
        requester: str = "gov.example",
        cluster: str = "devnet",
        settler=None,
        log=print,
    ):
        self.auditor = AuditAgent()
        self.verifier = VerificationAgent()
        self.remediators = remediators
        self.requester = requester
        self.cluster = cluster
        # a MockSettler by default; a real SolanaSettler when AGX_SOLANA_LIVE=1
        self.settler = settler or make_settler(cluster, log=log)
        self.log = log

    def run_marketplace(self, html: str, url: str = "inline") -> MarketResult:
        baseline = self.auditor.run(html, url)
        self.log(f"\n[audit] {url}: score {baseline.score()}/100, "
                 f"{len(baseline.violations)} violation(s)")
        for v in baseline.violations:
            self.log(f"    - {v.rule:<14} {v.criterion:<32} @ {v.selector}  (bounty {v.weight})")

        # Requester escrows one bounty per violation.
        escrow = Escrow(requester=self.requester, cluster=self.cluster, settler=self.settler)
        for v in baseline.violations:
            escrow.open_bounty(Bounty(violation_key=v.key, rule=v.rule, amount=v.weight))
        self.log(f"\n[escrow] {self.requester} locked {escrow.locked} units across "
                 f"{len(escrow.bounties)} bounties on Solana {self.cluster}")

        working = html
        awards: list[Award] = []
        rounds = 0
        MAX_ROUNDS = len(baseline.violations) + 2

        while rounds < MAX_ROUNDS:
            current = self.auditor.run(working, url)
            open_keys = {k for k, b in escrow.bounties.items() if b.status == "open"}
            open_now = [v for v in current.violations if v.key in open_keys]
            if not open_now:
                break
            rounds += 1

            # Gather competing patches from every remediation agent.
            candidates: dict[str, list] = {}
            for agent in self.remediators:
                for patch in agent.run(working, open_now):
                    candidates.setdefault(patch.target_key, []).append(patch)

            # Settle one bounty this round (then re-audit so fixes compound safely).
            settled: Award | None = None
            for target in [v.key for v in open_now]:
                bids = candidates.get(target, [])
                if bids:
                    self.log(f"\n[round {rounds}] {len(bids)} agent(s) bid on {target}: "
                             f"{', '.join(p.agent for p in bids)}")
                for patch in bids:
                    verdict = self.verifier.run(patch, current)
                    mark = "ACCEPT" if verdict.accepted else "reject"
                    self.log(f"    [{mark}] {patch.agent}: {verdict.reason}")
                    if verdict.accepted:
                        entry: LedgerEntry = escrow.release(
                            target, patch.agent,
                            memo=f"fix {patch.rule} {target}")
                        working = patch.html
                        settled = Award(
                            violation_key=target, rule=patch.rule, winner=patch.agent,
                            amount=entry.amount if entry else 0,
                            tx=entry.tx if entry else "-",
                            verdict=verdict.reason,
                            before_score=verdict.before_score,
                            after_score=verdict.after_score)
                        self.log(f"    -> paid {settled.amount} to {patch.agent} "
                                 f"(tx {settled.tx})")
                        break
                if settled:
                    break

            if not settled:
                self.log("\n[stall] no agent could produce a verified fix — stopping")
                break
            awards.append(settled)

        refunded = escrow.refund_unclaimed()
        final = self.auditor.run(working, url)
        self.log(f"\n[done] final score {final.score()}/100, "
                 f"{len(final.violations)} violation(s) remaining; refunded {refunded} unclaimed")

        return MarketResult(
            baseline=baseline, final=final, awards=awards,
            escrow_summary=escrow.summary(), rounds=rounds, refunded=refunded)
