"""Fetch live HTML for auditing.

Stdlib-only (urllib) so the crawler adds no dependencies. Handles redirects, a
sane User-Agent, gzip, and a timeout, and returns decoded HTML text. Raises
`FetchError` with a readable message on failure so agents can report cleanly.
"""

from __future__ import annotations

import gzip
import io
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

UA = "AccessGuardExchange/0.1 (+accessibility-audit-agent)"


class FetchError(Exception):
    pass


def fetch_html(url: str, timeout: float = 15.0, max_bytes: int = 3_000_000) -> str:
    if not url.lower().startswith(("http://", "https://")):
        raise FetchError(f"unsupported URL scheme: {url!r} (expected http/https)")
    req = Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*",
                                "Accept-Encoding": "gzip"})
    try:
        with urlopen(req, timeout=timeout) as resp:
            ctype = resp.headers.get("Content-Type", "")
            if "html" not in ctype and ctype:
                # still try — some servers mislabel — but guard obvious binaries
                if any(b in ctype for b in ("image/", "application/pdf", "video/")):
                    raise FetchError(f"{url} is not HTML (Content-Type: {ctype})")
            raw = resp.read(max_bytes)
            if resp.headers.get("Content-Encoding") == "gzip":
                raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")
    except HTTPError as e:
        raise FetchError(f"HTTP {e.code} fetching {url}") from e
    except URLError as e:
        raise FetchError(f"could not reach {url}: {e.reason}") from e
    except TimeoutError as e:
        raise FetchError(f"timed out fetching {url}") from e
