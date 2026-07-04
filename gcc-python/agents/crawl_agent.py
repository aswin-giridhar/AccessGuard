"""Crawl Agent — fetches a live URL so the market can operate on real pages.

Registered under CoralOS as the MCP tool `crawl(url) -> {url, html}`. Kept separate
from the audit tool so a page can be fetched once and reused across the whole loop.
"""

from __future__ import annotations

from engine.fetch import fetch_html, FetchError


class CrawlAgent:
    name = "crawl-agent"
    mcp_tool = "crawl"

    def run(self, url: str) -> dict:
        html = fetch_html(url)
        return {"url": url, "html": html}

    def try_run(self, url: str) -> dict | None:
        try:
            return self.run(url)
        except FetchError:
            return None
