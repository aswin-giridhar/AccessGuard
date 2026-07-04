"""Cross-engine conformance harness (Python side).

Runs the Python WCAG engine over the shared ``conformance/*.html`` fixtures and
asserts the score and the sorted-unique rule ids match ``conformance/expected.json``
— the single source of truth that the TypeScript engine's conformance test reads too.

If the two engines ever diverge on a fixture again (as they did on heading-order),
one of the two conformance tests fails loudly instead of the drift going unnoticed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Resolve paths relative to THIS file so the test is location-independent:
#   gcc-python/tests/test_conformance.py -> repo root -> conformance/
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[2]
_CONFORMANCE = _REPO_ROOT / "conformance"

# Make the Python engine importable (gcc-python/ is the package root for `engine`).
sys.path.insert(0, str(_HERE.parents[1]))

from engine import audit  # noqa: E402


def _load_expected() -> dict:
    with (_CONFORMANCE / "expected.json").open(encoding="utf-8") as fh:
        return json.load(fh)


EXPECTED = _load_expected()


@pytest.mark.parametrize("filename", sorted(EXPECTED.keys()))
def test_conformance_fixture(filename: str) -> None:
    html = (_CONFORMANCE / filename).read_text(encoding="utf-8")
    report = audit(html)

    got_score = report.score()
    got_rules = sorted({v.rule for v in report.violations})

    exp = EXPECTED[filename]
    assert got_score == exp["score"], (
        f"{filename}: score {got_score} != expected {exp['score']}"
    )
    assert got_rules == sorted(exp["rules"]), (
        f"{filename}: rules {got_rules} != expected {sorted(exp['rules'])}"
    )


def test_every_fixture_has_expected_entry() -> None:
    """Guard: every conformance/*.html fixture is covered by expected.json."""
    fixtures = {p.name for p in _CONFORMANCE.glob("*.html")}
    assert fixtures == set(EXPECTED.keys()), (
        f"fixtures {sorted(fixtures)} != expected keys {sorted(EXPECTED.keys())}"
    )
