"""Audit Agent — exposes the deterministic WCAG engine as a marketplace capability.

In a CoralOS deployment this is registered as an MCP tool `audit(html, url) -> report`.
It is the market's price-setter: it turns a page into a list of violations, each with
a bounty weight, which the requester escrows.
"""

from __future__ import annotations

from engine.types import AuditReport
from engine.wcag import audit


class AuditAgent:
    name = "audit-agent"
    mcp_tool = "audit"

    def run(self, html: str, url: str = "inline") -> AuditReport:
        return audit(html, url)
