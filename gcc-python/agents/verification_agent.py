"""Verification Agent — the neutral referee.

It never trusts a remediation agent's claim; it re-audits the patched page with the
same deterministic engine and returns an objective verdict. This is the trust anchor
that lets the escrow release funds without a human in the loop.

Registered under CoralOS as the MCP tool `verify(patch, baseline) -> verdict`.
"""

from __future__ import annotations

from engine.types import AuditReport, Patch
from engine.verify import verify_fix, VerdictDetail


class VerificationAgent:
    name = "verification-agent"
    mcp_tool = "verify"

    def run(self, patch: Patch, baseline: AuditReport) -> VerdictDetail:
        return verify_fix(patch.html, patch.target_key, baseline)
