"""Remediation Agent — a competing supplier in the marketplace.

Each instance has a `skill` (generalist or a specialist niche). Given the current page
and the open violations, it proposes patches for the ones it can fix. Multiple agents
overlap on the lucrative rules, so they genuinely compete for the same bounty — the
verifier decides who actually earns it.

Registered under CoralOS as the MCP tool `remediate(html, violations) -> patches`.
"""

from __future__ import annotations

from engine.types import Patch, Violation
from engine.remediate import propose_patches


class RemediationAgent:
    mcp_tool = "remediate"

    def __init__(self, name: str, skill: str = "generalist"):
        self.name = name
        self.skill = skill

    def run(self, html: str, violations: list[Violation]) -> list[Patch]:
        return propose_patches(html, violations, agent=self.name, skill=self.skill)
