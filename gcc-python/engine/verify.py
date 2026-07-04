"""Objective verification — the trustless referee that gates every payout.

A patch is accepted for its bounty *iff*:
  1. the specific violation it claimed (`target_key`) is GONE after a fresh audit, AND
  2. it introduced NO new violations anywhere else on the page.

Because the audit is deterministic, this decision is reproducible by anyone — the
requester, the winning agent, or a sceptical third party — so no trust is required.
"""

from __future__ import annotations

from dataclasses import dataclass

from .types import AuditReport
from .wcag import audit


@dataclass
class VerdictDetail:
    accepted: bool
    reason: str
    fixed_key: str
    new_violations: list[str]
    before_score: int
    after_score: int


def verify_fix(
    patched_html: str,
    target_key: str,
    baseline: AuditReport,
) -> VerdictDetail:
    after = audit(patched_html, url=baseline.url)
    before_keys = baseline.keys
    after_keys = after.keys

    introduced = sorted(after_keys - before_keys)
    fixed = target_key not in after_keys

    if target_key not in before_keys:
        return VerdictDetail(False, f"claimed violation {target_key} was not in the baseline",
                             target_key, introduced, baseline.score(), after.score())
    if not fixed:
        return VerdictDetail(False, f"claimed violation {target_key} is still present",
                             target_key, introduced, baseline.score(), after.score())
    if introduced:
        return VerdictDetail(False, f"introduced {len(introduced)} new violation(s): {introduced}",
                             target_key, introduced, baseline.score(), after.score())

    return VerdictDetail(True, f"{target_key} resolved; no regressions",
                         target_key, [], baseline.score(), after.score())
