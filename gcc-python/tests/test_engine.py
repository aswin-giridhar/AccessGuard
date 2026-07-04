"""Pytest suite for the deterministic WCAG audit + remediation + verify engine.

These tests pin the engine's public contract (engine/__init__.py):
  - audit(html)          -> AuditReport (deterministic)
  - propose_patches(...)  -> list[Patch]
  - verify_fix(...)       -> VerdictDetail

The whole marketplace's trustlessness rests on `audit` being deterministic and
`verify_fix` being an objective gate, so those two properties get the most
attention here.
"""

from __future__ import annotations

import pathlib

import pytest

from engine import audit, propose_patches, verify_fix


# --------------------------------------------------------------------------- #
# Helpers / fixtures
# --------------------------------------------------------------------------- #
SAMPLES = pathlib.Path(__file__).resolve().parent.parent / "samples"


def _load(name: str) -> str:
    return (SAMPLES / name).read_text(encoding="utf-8")


def _rules(html: str) -> set[str]:
    return {v.rule for v in audit(html).violations}


# A page with exactly one violation per rule under test — crafted so nothing
# *other* than the intended rule fires. Each also declares lang + title so the
# always-on doc-title / html-lang checks stay quiet.
def _wrap(body: str, *, lang: str = "en", title: str = "Test Page") -> str:
    return (
        f'<!DOCTYPE html><html lang="{lang}">'
        f"<head><title>{title}</title></head>"
        f"<body>{body}</body></html>"
    )


CLEAN_PAGE = _wrap(
    """
    <h1>City Council Services</h1>
    <h2>Parking permits</h2>
    <img src="logo.png" alt="City Council logo">
    <form action="/apply" method="post">
      <label for="fullname">Full name</label>
      <input type="text" id="fullname" name="fullname">
    </form>
    <button>Submit application</button>
    <p>Need help? <a href="/contact">Contact us</a></p>
    <p style="color:#000000; background-color:#ffffff;">High contrast text.</p>
    """
)


# --------------------------------------------------------------------------- #
# 1. Determinism
# --------------------------------------------------------------------------- #
def test_audit_is_deterministic_on_samples():
    html = _load("inaccessible.html")
    first = audit(html)
    second = audit(html)

    assert first.score() == second.score()
    # identical violations, in the same order, with identical hints
    assert [v.to_dict() for v in first.violations] == [
        v.to_dict() for v in second.violations
    ]
    # and identical stable-key sets
    assert first.keys == second.keys


def test_audit_is_deterministic_on_clean_page():
    a, b = audit(CLEAN_PAGE), audit(CLEAN_PAGE)
    assert a.to_dict() == b.to_dict()


# --------------------------------------------------------------------------- #
# 2. Each of the 8 rules fires on a crafted minimal document
# --------------------------------------------------------------------------- #
def test_rule_doc_title():
    # title missing entirely (lang present so only doc-title fires)
    html = '<!DOCTYPE html><html lang="en"><head></head><body><p>Hi</p></body></html>'
    assert _rules(html) == {"doc-title"}


def test_rule_html_lang():
    # lang missing, title present, non-CJK -> only html-lang
    html = "<!DOCTYPE html><html><head><title>Hi</title></head><body><p>Hi</p></body></html>"
    rules = _rules(html)
    assert "html-lang" in rules
    assert rules == {"html-lang"}


def test_rule_img_alt():
    assert "img-alt" in _rules(_wrap('<img src="council-logo.png">'))


def test_rule_form_label():
    assert "form-label" in _rules(_wrap('<input type="text" name="full-name">'))


def test_rule_control_name():
    assert "control-name" in _rules(_wrap("<button></button>"))


def test_rule_link_name():
    assert "link-name" in _rules(_wrap('<a href="/contact"></a>'))


def test_rule_contrast():
    body = '<p style="color:#9a9a9a; background-color:#ffffff;">Low contrast copy.</p>'
    assert "contrast" in _rules(_wrap(body))


def test_rule_heading_order():
    # h1 -> h3 skips h2
    assert "heading-order" in _rules(_wrap("<h1>Title</h1><h3>Sub</h3>"))


def test_all_eight_rules_are_covered():
    # the crafted samples above collectively exercise every rule id the engine ships
    covered = set()
    covered |= _rules('<!DOCTYPE html><html lang="en"><head></head><body><p>Hi</p></body></html>')
    covered |= _rules("<!DOCTYPE html><html><head><title>Hi</title></head><body><p>Hi</p></body></html>")
    covered |= _rules(_wrap('<img src="x.png">'))
    covered |= _rules(_wrap('<input type="text" name="x">'))
    covered |= _rules(_wrap("<button></button>"))
    covered |= _rules(_wrap('<a href="/x"></a>'))
    covered |= _rules(_wrap('<p style="color:#9a9a9a; background-color:#ffffff;">x</p>'))
    covered |= _rules(_wrap("<h1>a</h1><h3>b</h3>"))
    assert {
        "doc-title", "html-lang", "img-alt", "form-label",
        "control-name", "link-name", "contrast", "heading-order",
    } <= covered


# --------------------------------------------------------------------------- #
# 3. A fully accessible page: score 100, zero violations
# --------------------------------------------------------------------------- #
def test_clean_page_scores_100_with_no_violations():
    report = audit(CLEAN_PAGE)
    assert report.violations == []
    assert report.score() == 100
    assert report.total_weight == 0


# --------------------------------------------------------------------------- #
# 4. CJK: mislabeled Chinese page flags html-lang with correct variant fix
# --------------------------------------------------------------------------- #
def _html_lang_hint(html: str):
    for v in audit(html).violations:
        if v.rule == "html-lang":
            return v
    return None


def test_cjk_mislabeled_lang_flags_html_lang():
    v = _html_lang_hint(_load("inaccessible-zh.html"))
    assert v is not None, "Chinese page mislabeled lang='en' must flag html-lang"


def test_cjk_traditional_suggests_zh_hant():
    v = _html_lang_hint(_load("inaccessible-zh.html"))
    assert v is not None
    assert v.fix_hint.get("suggested") == "zh-Hant"


def test_cjk_simplified_suggests_zh_hans():
    v = _html_lang_hint(_load("inaccessible-zh-hans.html"))
    assert v is not None
    assert v.fix_hint.get("suggested") == "zh-Hans"


def test_non_cjk_missing_lang_suggests_en():
    html = "<!DOCTYPE html><html><head><title>Hi</title></head><body><p>Hello world</p></body></html>"
    v = _html_lang_hint(html)
    assert v is not None
    assert v.fix_hint.get("suggested") == "en"


# --------------------------------------------------------------------------- #
# 5. The accept/verify gate
# --------------------------------------------------------------------------- #
# Baseline document with a single img-alt violation, nothing else.
_IMG_ONLY = _wrap('<img src="council-logo.png">')


def test_real_remediation_passes_verify():
    baseline = audit(_IMG_ONLY)
    target = next(v for v in baseline.violations if v.rule == "img-alt")

    patches = propose_patches(_IMG_ONLY, baseline.violations, agent="tester")
    patch = next(p for p in patches if p.target_key == target.key)

    verdict = verify_fix(patch.html, patch.target_key, baseline)
    assert verdict.accepted is True
    assert verdict.new_violations == []
    # the target violation is genuinely gone from a fresh audit
    assert target.key not in audit(patch.html).keys


def test_noop_fails_verify():
    baseline = audit(_IMG_ONLY)
    target = next(v for v in baseline.violations if v.rule == "img-alt")

    # unchanged HTML: the claimed violation is still present -> rejected
    verdict = verify_fix(_IMG_ONLY, target.key, baseline)
    assert verdict.accepted is False
    assert target.key in audit(_IMG_ONLY).keys


def test_fix_that_introduces_new_violation_fails_verify():
    baseline = audit(_IMG_ONLY)
    target = next(v for v in baseline.violations if v.rule == "img-alt")

    # Fix the img (alt added) but simultaneously break something else:
    # drop the <title>, which introduces a brand-new doc-title violation.
    tampered = (
        '<!DOCTYPE html><html lang="en"><head></head>'
        '<body><img src="council-logo.png" alt="City Council logo"></body></html>'
    )
    after_keys = audit(tampered).keys
    assert target.key not in after_keys, "img-alt should be resolved in the tampered doc"
    assert any(k.startswith("doc-title@") for k in after_keys), "a new violation must exist"

    verdict = verify_fix(tampered, target.key, baseline)
    assert verdict.accepted is False
    assert verdict.new_violations, "verifier must report the introduced violation(s)"


def test_verify_rejects_claim_not_in_baseline():
    # A target that was never in the baseline can't be 'fixed' -> rejected.
    baseline = audit(CLEAN_PAGE)  # no violations at all
    verdict = verify_fix(CLEAN_PAGE, "img-alt@img[0]", baseline)
    assert verdict.accepted is False


# --------------------------------------------------------------------------- #
# 6. Scoring caps at 0 for the heavily-broken sample
# --------------------------------------------------------------------------- #
def test_heavily_broken_sample_scores_zero():
    report = audit(_load("inaccessible.html"))
    assert report.total_weight > 100  # penalty would exceed the cap
    assert report.score() == 0  # but score never goes negative


@pytest.mark.parametrize(
    "sample",
    ["inaccessible.html", "inaccessible-zh.html", "inaccessible-zh-hans.html"],
)
def test_all_broken_samples_score_zero(sample):
    assert audit(_load(sample)).score() == 0
