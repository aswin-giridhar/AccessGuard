"""End-to-end AccessGuard Exchange demo — runs the whole agent economy.

    python demo.py                       # uses samples/inaccessible.html
    python demo.py path/to.html          # audit + remediate + settle a local file
    python demo.py https://example.gov   # crawl a LIVE url, then run the market

Offline by default: the deterministic engine is the referee and settlement uses a
mock signature so the ledger is inspectable without a network. Set AGX_SOLANA_LIVE=1
(with a funded devnet keypair) to settle on real Solana devnet.
"""

from __future__ import annotations

import os
import sys

from agents.orchestrator import Orchestrator
from agents.remediation_agent import RemediationAgent
from agents.crawl_agent import CrawlAgent
from engine.fetch import FetchError

HERE = os.path.dirname(os.path.abspath(__file__))


def load_source() -> tuple[str, str]:
    """Return (html, label) from a URL, a local path, or the bundled sample."""
    arg = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "samples", "inaccessible.html")
    if arg.lower().startswith(("http://", "https://")):
        print(f"[crawl] fetching {arg} ...")
        try:
            page = CrawlAgent().run(arg)
        except FetchError as e:
            print(f"[crawl] FAILED: {e}")
            sys.exit(1)
        return page["html"], arg
    with open(arg, "r", encoding="utf-8") as fh:
        return fh.read(), os.path.basename(arg)


def main() -> None:
    html, label = load_source()

    # A market with competing suppliers: two generalists plus three specialists.
    remediators = [
        RemediationAgent("acme-a11y", skill="generalist"),
        RemediationAgent("swiftfix", skill="generalist"),
        RemediationAgent("contrast-co", skill="contrast-specialist"),
        RemediationAgent("formfixers", skill="forms-specialist"),
        RemediationAgent("semantica", skill="semantics-specialist"),
    ]

    print("=" * 74)
    print("AccessGuard Exchange — accessibility bounty marketplace (offline demo)")
    print("=" * 74)

    orch = Orchestrator(remediators=remediators, requester="city-council.gov")
    result = orch.run_marketplace(html, url=label)

    print("\n" + "-" * 74)
    print("SETTLEMENT LEDGER (Solana devnet — mock signatures)")
    print("-" * 74)
    print(f"{'violation':<26}{'rule':<15}{'winner':<14}{'amount':>7}  tx")
    for a in result.awards:
        print(f"{a.violation_key:<26}{a.rule:<15}{a.winner:<14}{a.amount:>7}  {a.tx}")

    s = result.escrow_summary
    print("\n" + "-" * 74)
    print("MARKET SUMMARY")
    print("-" * 74)
    print(f"  accessibility score : {result.baseline.score()}/100  ->  {result.final.score()}/100")
    print(f"  bounties settled     : {s['bounties_paid']}/{s['bounties_total']}")
    print(f"  paid out (verified)  : {s['amount_paid']} units on Solana {s['cluster']}")
    print(f"  refunded (unclaimed) : {result.refunded} units")
    print(f"  rounds               : {result.rounds}")

    if result.final.violations:
        print("\n  remaining violations (no verified fix):")
        for v in result.final.violations:
            print(f"    - {v.rule} @ {v.selector}: {v.message}")
    else:
        print("\n  PAGE IS NOW WCAG-CLEAN (for the covered ruleset).")


if __name__ == "__main__":
    main()
