"""Web UI backend for AccessGuard Exchange.

A small FastAPI app that runs the marketplace and returns a structured result the
frontend visualises (before/after scores, the violation list, competing bids, and the
Solana settlement ledger).

    pip install fastapi uvicorn
    python -m uvicorn web.server:app --reload --port 8000
    # then open http://localhost:8000
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from agents.orchestrator import Orchestrator
from agents.remediation_agent import RemediationAgent
from engine.fetch import fetch_html, FetchError

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SAMPLE = os.path.join(ROOT, "samples", "inaccessible.html")

app = FastAPI(title="AccessGuard Exchange")


def _remediators() -> list[RemediationAgent]:
    return [
        RemediationAgent("acme-a11y", "generalist"),
        RemediationAgent("swiftfix", "generalist"),
        RemediationAgent("contrast-co", "contrast-specialist"),
        RemediationAgent("formfixers", "forms-specialist"),
        RemediationAgent("semantica", "semantics-specialist"),
    ]


class RunRequest(BaseModel):
    mode: str = "sample"          # "sample" | "html" | "url"
    html: str | None = None
    url: str | None = None


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    with open(os.path.join(HERE, "index.html"), "r", encoding="utf-8") as fh:
        return fh.read()


@app.get("/api/sample")
def sample() -> dict:
    with open(SAMPLE, "r", encoding="utf-8") as fh:
        return {"html": fh.read()}


@app.post("/api/run")
def run(req: RunRequest):
    if req.mode == "url":
        if not req.url:
            return JSONResponse({"error": "url required"}, status_code=400)
        try:
            html = fetch_html(req.url)
        except FetchError as e:
            return JSONResponse({"error": str(e)}, status_code=400)
        label = req.url
    elif req.mode == "html":
        html = req.html or ""
        label = "pasted-html"
    else:
        with open(SAMPLE, "r", encoding="utf-8") as fh:
            html = fh.read()
        label = "inaccessible.html"

    logs: list[str] = []
    orch = Orchestrator(_remediators(), requester="city-council.gov", log=logs.append)
    r = orch.run_marketplace(html, url=label)

    return {
        "label": label,
        "baseline": r.baseline.to_dict(),
        "final": r.final.to_dict(),
        "awards": [a.__dict__ for a in r.awards],
        "escrow": r.escrow_summary,
        "rounds": r.rounds,
        "refunded": r.refunded,
        "log": logs,
    }
