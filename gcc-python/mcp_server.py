"""MCP server — exposes the AccessGuard Exchange crew as MCP tools.

CoralOS is MCP-native: it composes, governs and observes agents that speak MCP. This
server publishes each marketplace capability as a standard MCP tool, so the crew is
framework-agnostic and can be orchestrated by CoralOS (or any MCP client / host).

Tools:
    crawl(url)                         -> {url, html}
    audit(html, url)                   -> {url, score, violations[]}
    remediate(html, violations, skill) -> {patches[]}
    verify(patched_html, target_key, baseline) -> verdict
    run_marketplace(html|url)          -> full market result (audit → compete → verify → settle)

Run it:
    pip install "mcp[cli]"
    python mcp_server.py            # stdio transport (what CoralOS / MCP hosts expect)
"""

from __future__ import annotations

from typing import Any

from engine.wcag import audit as _audit
from engine.remediate import propose_patches
from engine.types import Violation, AuditReport
from engine.verify import verify_fix
from engine.fetch import fetch_html, FetchError
from agents.orchestrator import Orchestrator
from agents.remediation_agent import RemediationAgent

try:
    from mcp.server.fastmcp import FastMCP
except ImportError as e:  # pragma: no cover
    raise SystemExit(
        "The 'mcp' package is required to run the MCP server.\n"
        "Install it with:  pip install \"mcp[cli]\""
    ) from e

mcp = FastMCP("accessguard-exchange")


def _violation_from_dict(d: dict) -> Violation:
    return Violation(
        rule=d["rule"], criterion=d.get("criterion", ""), severity=d.get("severity", "moderate"),
        selector=d["selector"], snippet=d.get("snippet", ""), message=d.get("message", ""),
        fix_hint=d.get("fix_hint", {}),
    )


@mcp.tool()
def crawl(url: str) -> dict:
    """Fetch a live URL's HTML for auditing."""
    try:
        return {"url": url, "html": fetch_html(url)}
    except FetchError as e:
        return {"error": str(e)}


@mcp.tool()
def audit(html: str, url: str = "inline") -> dict:
    """Run the deterministic WCAG audit engine over an HTML document."""
    return _audit(html, url).to_dict()


@mcp.tool()
def remediate(html: str, violations: list[dict], skill: str = "generalist") -> dict:
    """Propose patches for the given violations, per an agent skill niche."""
    vs = [_violation_from_dict(v) for v in violations]
    patches = propose_patches(html, vs, agent=f"mcp-{skill}", skill=skill)
    return {"patches": [{**p.to_dict(), "html": p.html} for p in patches]}


@mcp.tool()
def verify(patched_html: str, target_key: str, baseline: dict) -> dict:
    """Objectively verify a patch: is the claimed violation gone, with no regressions?"""
    report = AuditReport(
        url=baseline.get("url", "inline"),
        violations=[_violation_from_dict(v) for v in baseline.get("violations", [])],
    )
    verdict = verify_fix(patched_html, target_key, report)
    return {
        "accepted": verdict.accepted, "reason": verdict.reason,
        "fixed_key": verdict.fixed_key, "new_violations": verdict.new_violations,
        "before_score": verdict.before_score, "after_score": verdict.after_score,
    }


@mcp.tool()
def run_marketplace(html: str | None = None, url: str | None = None) -> dict[str, Any]:
    """Run the full trustless marketplace on inline HTML or a live URL."""
    if url and not html:
        try:
            html = fetch_html(url)
        except FetchError as e:
            return {"error": str(e)}
    if not html:
        return {"error": "provide either html or url"}

    remediators = [
        RemediationAgent("acme-a11y", "generalist"),
        RemediationAgent("contrast-co", "contrast-specialist"),
        RemediationAgent("formfixers", "forms-specialist"),
        RemediationAgent("semantica", "semantics-specialist"),
    ]
    logs: list[str] = []
    orch = Orchestrator(remediators, requester="mcp-client", log=logs.append)
    r = orch.run_marketplace(html, url=url or "inline")
    return {
        "baseline": r.baseline.to_dict(),
        "final": r.final.to_dict(),
        "awards": [a.__dict__ for a in r.awards],
        "escrow": r.escrow_summary,
        "rounds": r.rounds,
        "refunded": r.refunded,
        "log": logs,
    }


if __name__ == "__main__":
    mcp.run()
