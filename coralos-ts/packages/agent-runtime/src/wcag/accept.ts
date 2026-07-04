/**
 * Acceptance — the verifier's deterministic accessibility gate.
 *
 * A delivered fix is accepted for payment iff it OBJECTIVELY improves the page:
 *   1. it introduces NO new violation anywhere (afterKeys ⊆ baselineKeys), AND
 *   2. it resolves at least one baseline violation (strictly fewer violations).
 *
 * This replaces the marketplace's optional LLM "acceptance judge" with a re-runnable
 * oracle — so the settlement holds up under dispute and can't be prompt-injected.
 */
import { audit } from './audit.js'
import { violationKey } from './types.js'

export interface AccessibilityVerdict {
  pass: boolean
  reason: string
  scoreBefore: number
  scoreAfter: number
  resolved: number
  introduced: string[]
}

export function acceptAccessibility(baselineHtml: string, deliveredHtml: string): AccessibilityVerdict {
  const before = audit(baselineHtml)
  const after = audit(deliveredHtml)
  const beforeKeys = new Set(before.violations.map(violationKey))
  const afterKeys = new Set(after.violations.map(violationKey))

  const introduced = [...afterKeys].filter((k) => !beforeKeys.has(k))
  const resolved = before.violations.length - after.violations.length

  if (introduced.length > 0) {
    return {
      pass: false, reason: `introduced ${introduced.length} new violation(s)`,
      scoreBefore: before.score, scoreAfter: after.score, resolved, introduced,
    }
  }
  if (resolved <= 0) {
    return {
      pass: false, reason: 'no violations resolved',
      scoreBefore: before.score, scoreAfter: after.score, resolved: 0, introduced: [],
    }
  }
  return {
    pass: true, reason: `resolved ${resolved} violation(s), score ${before.score}->${after.score}, no regressions`,
    scoreBefore: before.score, scoreAfter: after.score, resolved, introduced: [],
  }
}
