"""Core data types shared across the AccessGuard Exchange engine and agents.

Every type here is a plain dataclass so the whole pipeline is serialisable — a
prerequisite for passing work between agents (and, eventually, over MCP / a chain).
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


# Per-rule bounty weight (in the marketplace's accounting unit, e.g. USDC lamports
# scaled down for readability). These make some fixes worth more than others —
# contrast and missing form labels lock users out harder than a missing title.
RULE_WEIGHTS: dict[str, int] = {
    "img-alt": 20,
    "contrast": 30,
    "form-label": 30,
    "control-name": 25,
    "link-name": 20,
    "html-lang": 10,
    "doc-title": 10,
    "heading-order": 15,
}


@dataclass
class Violation:
    """A single WCAG failure, located precisely enough for a fix to target it."""

    rule: str            # stable rule id, e.g. "img-alt"
    criterion: str       # WCAG success criterion, e.g. "1.1.1 Non-text Content"
    severity: str        # "critical" | "serious" | "moderate"
    selector: str        # a locator, e.g. "img:nth-of-type(2)"
    snippet: str         # the offending source, trimmed
    message: str         # human-readable explanation
    fix_hint: dict[str, Any] = field(default_factory=dict)  # data the remediator uses

    @property
    def weight(self) -> int:
        return RULE_WEIGHTS.get(self.rule, 10)

    @property
    def key(self) -> str:
        """Stable identity of this violation (rule @ location)."""
        return f"{self.rule}@{self.selector}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AuditReport:
    """Result of running the WCAG engine over one HTML document."""

    url: str
    violations: list[Violation] = field(default_factory=list)

    @property
    def keys(self) -> set[str]:
        return {v.key for v in self.violations}

    @property
    def total_weight(self) -> int:
        return sum(v.weight for v in self.violations)

    def score(self) -> int:
        """A simple 0-100 accessibility score (100 = no detected violations)."""
        penalty = min(self.total_weight, 100)
        return 100 - penalty

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "score": self.score(),
            "violations": [v.to_dict() for v in self.violations],
        }


@dataclass
class Patch:
    """A proposed fix for one violation, produced by a remediation agent."""

    agent: str           # which agent authored it
    target_key: str      # the Violation.key it claims to fix
    rule: str
    html: str            # the FULL patched document this agent proposes
    rationale: str       # short human-readable explanation of the change

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # the full html can be large; callers can opt in to it explicitly
        d["html_len"] = len(self.html)
        return d


@dataclass
class Bounty:
    """An escrowed reward attached to fixing a specific violation."""

    violation_key: str
    rule: str
    amount: int          # accounting units held in escrow
    status: str = "open"  # "open" | "paid" | "expired"
    winner: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
