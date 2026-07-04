"""Remediation: turn a Violation into a concrete patch (the full fixed HTML).

A remediation agent calls `propose_patches` with the rules it specialises in. Each
returned Patch is a *complete* patched document that claims to fix exactly one
violation — the verifier then re-audits it objectively before any payout.

Fixes are attribute/text edits located by the same stable `tag[index]` locator the
auditor uses, so the verifier can confirm the specific violation is gone.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from .types import Patch, Violation
from .wcag import parse_color, contrast_ratio


def _find(soup: BeautifulSoup, selector: str) -> Tag | None:
    m = re.fullmatch(r"([a-z0-9]+)\[(\d+)\]", selector)
    if not m:
        return None
    tag, idx = m.group(1), int(m.group(2))
    els = soup.find_all(tag)
    return els[idx] if idx < len(els) else None


def _titleize(text: str) -> str:
    text = re.sub(r"[-_]+", " ", text).strip()
    return text[:1].upper() + text[1:] if text else text


def _best_contrast_color(bg: tuple[int, int, int]) -> str:
    """Pick black or white — whichever gives the higher ratio against `bg`."""
    black_ratio = contrast_ratio((0, 0, 0), bg)
    white_ratio = contrast_ratio((255, 255, 255), bg)
    return "#000000" if black_ratio >= white_ratio else "#ffffff"


def _set_style_prop(el: Tag, prop: str, value: str) -> None:
    raw = el.get("style", "") or ""
    decls = [d for d in raw.split(";") if d.strip() and not d.strip().lower().startswith(prop + ":")
             and ":" in d and d.split(":", 1)[0].strip().lower() != prop]
    decls.append(f"{prop}: {value}")
    el["style"] = "; ".join(d.strip() for d in decls)


def apply_fix(html: str, violation: Violation) -> str | None:
    """Return a new HTML string with `violation` fixed, or None if not fixable."""
    soup = BeautifulSoup(html, "html.parser")
    rule = violation.rule
    hint = violation.fix_hint

    if rule == "doc-title":
        head = soup.find("head")
        if head is None:
            head = soup.new_tag("head")
            html_el = soup.find("html")
            (html_el or soup).insert(0, head)
        title = soup.find("title")
        if title is None:
            title = soup.new_tag("title")
            head.append(title)
        title.string = hint.get("suggested", "Untitled Page")
        return str(soup)

    if rule == "html-lang":
        html_el = soup.find("html")
        if isinstance(html_el, Tag):
            html_el["lang"] = hint.get("suggested", "en")
            return str(soup)
        return None

    el = _find(soup, violation.selector)
    if not isinstance(el, Tag):
        return None

    if rule == "img-alt":
        src = hint.get("src", "")
        base = re.sub(r"\.\w+$", "", src)
        el["alt"] = _titleize(base) if base else ""
        return str(soup)

    if rule == "form-label":
        el["aria-label"] = _titleize(hint.get("suggested", "Field"))
        return str(soup)

    if rule in ("control-name", "link-name"):
        # prefer real text content; fall back to aria-label
        if not el.get_text(strip=True):
            el.append(hint.get("suggested", "Action"))
        else:
            el["aria-label"] = hint.get("suggested", "Action")
        return str(soup)

    if rule == "contrast":
        bg = parse_color(hint.get("bg", "")) or (255, 255, 255)
        _set_style_prop(el, "color", _best_contrast_color(bg))
        return str(soup)

    if rule == "heading-order":
        expected = hint.get("expected")
        if expected:
            el.name = f"h{expected}"
            return str(soup)
        return None

    return None


# Which rules each specialisation can address — used to create genuine competition
# (some agents overlap on the lucrative rules, others cover the long tail).
SKILLS: dict[str, set[str]] = {
    "generalist": {"img-alt", "contrast", "form-label", "control-name",
                   "link-name", "html-lang", "doc-title", "heading-order"},
    "contrast-specialist": {"contrast"},
    "forms-specialist": {"form-label", "control-name"},
    "semantics-specialist": {"img-alt", "link-name", "html-lang",
                             "doc-title", "heading-order"},
}


def propose_patches(
    html: str,
    violations: list[Violation],
    agent: str,
    skill: str = "generalist",
) -> list[Patch]:
    """Produce one Patch per violation this agent's skill can handle."""
    can_fix = SKILLS.get(skill, SKILLS["generalist"])
    patches: list[Patch] = []
    for v in violations:
        if v.rule not in can_fix:
            continue
        fixed = apply_fix(html, v)
        if fixed is None:
            continue
        patches.append(
            Patch(
                agent=agent,
                target_key=v.key,
                rule=v.rule,
                html=fixed,
                rationale=f"Fixed {v.rule} at {v.selector} ({v.criterion}).",
            )
        )
    return patches
