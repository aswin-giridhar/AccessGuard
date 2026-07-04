"""Deterministic WCAG 2.2 audit engine.

This is the trustless referee of the whole marketplace: given the same HTML it
returns the same violations, every time. No LLM, no network, no randomness — so a
payout can be gated on it without anyone having to trust a model's opinion.

Covered (a focused, high-impact subset of WCAG 2.2 A/AA):
  img-alt        1.1.1  Non-text Content
  contrast       1.4.3  Contrast (Minimum)
  form-label     1.3.1  Info and Relationships / 4.1.2 Name, Role, Value
  control-name   4.1.2  Name, Role, Value  (buttons)
  link-name      2.4.4  Link Purpose
  html-lang      3.1.1  Language of Page
  doc-title      2.4.2  Page Titled
  heading-order  1.3.1  Info and Relationships

The same architecture extends to the full ruleset (or an axe-core backend) without
changing anything downstream.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from .types import AuditReport, Violation


# ---------------------------------------------------------------------------
# Locators — stable identity for an element that survives attribute-only edits
# (remediators fix by changing attributes / text, never by restructuring).
# ---------------------------------------------------------------------------
def _locator(soup: BeautifulSoup, el: Tag) -> str:
    tag = el.name
    same = soup.find_all(tag)
    idx = same.index(el)
    return f"{tag}[{idx}]"


def _snippet(el: Tag, limit: int = 90) -> str:
    s = re.sub(r"\s+", " ", str(el)).strip()
    return s[:limit] + ("…" if len(s) > limit else "")


# ---------------------------------------------------------------------------
# Colour + contrast maths (WCAG relative luminance)
# ---------------------------------------------------------------------------
_NAMED = {
    "black": (0, 0, 0), "white": (255, 255, 255), "red": (255, 0, 0),
    "green": (0, 128, 0), "blue": (0, 0, 255), "gray": (128, 128, 128),
    "grey": (128, 128, 128), "silver": (192, 192, 192), "yellow": (255, 255, 0),
    "orange": (255, 165, 0), "navy": (0, 0, 128), "teal": (0, 128, 128),
}


def parse_color(value: str) -> tuple[int, int, int] | None:
    if not value:
        return None
    v = value.strip().lower()
    if v in _NAMED:
        return _NAMED[v]
    m = re.fullmatch(r"#([0-9a-f]{3})", v)
    if m:
        h = m.group(1)
        return tuple(int(c * 2, 16) for c in h)  # type: ignore[return-value]
    m = re.fullmatch(r"#([0-9a-f]{6})", v)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)", v)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def _luminance(rgb: tuple[int, int, int]) -> float:
    def chan(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    r, g, b = rgb
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)


def contrast_ratio(fg: tuple[int, int, int], bg: tuple[int, int, int]) -> float:
    l1, l2 = _luminance(fg), _luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def _inline_style(el: Tag) -> dict[str, str]:
    raw = el.get("style", "") or ""
    out: dict[str, str] = {}
    for decl in raw.split(";"):
        if ":" in decl:
            k, val = decl.split(":", 1)
            out[k.strip().lower()] = val.strip()
    return out


def _is_cjk_dominant(text: str) -> bool:
    """True if the page text is predominantly Chinese (CJK Han) characters.

    Used to make 3.1.1 language checks meaningful for the Chinese-speaking commons:
    a Chinese page with a missing or wrong `lang` breaks screen-reader pronunciation
    and language-specific rendering for disabled users in zh regions.
    """
    han = len(re.findall(r"[\u3400-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    return han >= 4 and han >= latin


# Representative script-exclusive characters. A heuristic, not a full converter: count
# characters unique to each script and pick the majority. Ambiguous text stays generic "zh".
_ZH_SIMP = set("们这国学东车电语说读体应观厅买卖为华旧时会员见长门问间关义书头实现发报让认识讲谢试严单处备复够继续网罗广湾")
_ZH_TRAD = set("們這國學東車電語說讀體應觀廳買賣為華舊時會員見長門問間關義書頭實現發報讓認識講謝試嚴單處備複夠繼續網羅廣灣")


def _detect_zh_variant(text: str) -> str:
    """Best-effort Simplified vs Traditional tag: 'zh-Hans' | 'zh-Hant' | 'zh' (ambiguous)."""
    simp = sum(1 for ch in text if ch in _ZH_SIMP)
    trad = sum(1 for ch in text if ch in _ZH_TRAD)
    if trad > simp:
        return "zh-Hant"
    if simp > trad:
        return "zh-Hans"
    return "zh"


def _accessible_text(el: Tag) -> str:
    """Best-effort accessible name from text + common attributes."""
    txt = el.get_text(strip=True)
    if txt:
        return txt
    for attr in ("aria-label", "title", "alt", "value"):
        if el.get(attr):
            return str(el.get(attr)).strip()
    # image inside a link/button contributes its alt
    img = el.find("img")
    if isinstance(img, Tag) and img.get("alt"):
        return str(img.get("alt")).strip()
    return ""


# ---------------------------------------------------------------------------
# The audit
# ---------------------------------------------------------------------------
def audit(html: str, url: str = "inline") -> AuditReport:
    soup = BeautifulSoup(html, "html.parser")
    violations: list[Violation] = []

    def add(rule, criterion, severity, el, message, fix_hint=None):
        violations.append(
            Violation(
                rule=rule,
                criterion=criterion,
                severity=severity,
                selector=_locator(soup, el) if isinstance(el, Tag) else url,
                snippet=_snippet(el) if isinstance(el, Tag) else "",
                message=message,
                fix_hint=fix_hint or {},
            )
        )

    # 2.4.2 Page Titled
    title = soup.find("title")
    if title is None or not title.get_text(strip=True):
        html_el = soup.find("html") or soup
        add("doc-title", "2.4.2 Page Titled", "serious", html_el,
            "Document has no non-empty <title> element.",
            {"suggested": "Untitled Page"})

    # 3.1.1 Language of Page — CJK-aware (serves the Chinese-speaking commons)
    html_el = soup.find("html")
    if isinstance(html_el, Tag):
        lang = str(html_el.get("lang") or "").strip().lower()
        cjk = _is_cjk_dominant(soup.get_text())
        suggested = _detect_zh_variant(soup.get_text()) if cjk else "en"
        if not lang:
            add("html-lang", "3.1.1 Language of Page", "serious", html_el,
                "<html> element is missing a lang attribute.", {"suggested": suggested})
        elif cjk and not lang.startswith("zh"):
            add("html-lang", "3.1.1 Language of Page", "serious", html_el,
                f'Page content is Chinese but lang="{lang}" declares a different language.',
                {"suggested": suggested})

    # 1.1.1 Non-text Content — <img> must have an alt attribute (alt="" is OK/decorative)
    for img in soup.find_all("img"):
        if img.get("alt") is None:
            src = str(img.get("src", "")).split("/")[-1]
            add("img-alt", "1.1.1 Non-text Content", "critical", img,
                "Image has no alt attribute.", {"src": src})

    # 1.3.1 / 4.1.2 — form controls must have an accessible label
    labelled_ids = {lbl.get("for") for lbl in soup.find_all("label") if lbl.get("for")}
    for ctrl in soup.find_all(["input", "select", "textarea"]):
        t = str(ctrl.get("type", "text")).lower()
        if ctrl.name == "input" and t in {"hidden", "submit", "button", "reset", "image"}:
            continue
        has_label = (
            ctrl.get("id") in labelled_ids
            or ctrl.get("aria-label")
            or ctrl.get("aria-labelledby")
            or ctrl.get("title")
            or (ctrl.find_parent("label") is not None)
        )
        if not has_label:
            add("form-label", "1.3.1 Info and Relationships", "critical", ctrl,
                "Form control has no associated label or accessible name.",
                {"suggested": (ctrl.get("name") or ctrl.get("id") or ctrl.name).replace("-", " ")})

    # 4.1.2 — buttons need an accessible name
    for btn in soup.find_all("button"):
        if not _accessible_text(btn) and not btn.get("aria-label"):
            add("control-name", "4.1.2 Name, Role, Value", "critical", btn,
                "Button has no discernible text.", {"suggested": "Submit"})

    # 2.4.4 — links need discernible text
    for a in soup.find_all("a"):
        if a.get("href") is None:
            continue
        if not _accessible_text(a) and not a.get("aria-label"):
            add("link-name", "2.4.4 Link Purpose", "serious", a,
                "Link has no discernible text.", {"suggested": "Learn more"})

    # 1.4.3 — text contrast (only where both colours are set inline; deterministic)
    for el in soup.find_all(True):
        style = _inline_style(el)
        fg, bg = parse_color(style.get("color", "")), parse_color(style.get("background-color", ""))
        if fg and bg and el.get_text(strip=True):
            ratio = contrast_ratio(fg, bg)
            if ratio < 4.5:
                add("contrast", "1.4.3 Contrast (Minimum)", "serious", el,
                    f"Text contrast ratio {ratio:.2f}:1 is below the 4.5:1 minimum.",
                    {"fg": style.get("color"), "bg": style.get("background-color"),
                     "ratio": round(ratio, 2)})

    # 1.3.1 — heading levels must not skip (e.g. h1 → h3)
    prev = 0
    for h in soup.find_all(re.compile(r"^h[1-6]$")):
        level = int(h.name[1])
        if prev and level > prev + 1:
            add("heading-order", "1.3.1 Info and Relationships", "moderate", h,
                f"Heading level jumps from h{prev} to h{level}, skipping a level.",
                {"expected": prev + 1})
        prev = level

    return AuditReport(url=url, violations=violations)
