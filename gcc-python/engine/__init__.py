"""AccessGuard Exchange — deterministic accessibility audit + remediation engine."""

from .types import Violation, AuditReport, Patch, Bounty
from .wcag import audit
from .remediate import propose_patches
from .verify import verify_fix

__all__ = [
    "Violation",
    "AuditReport",
    "Patch",
    "Bounty",
    "audit",
    "propose_patches",
    "verify_fix",
]
