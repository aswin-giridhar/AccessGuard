/**
 * Cross-engine conformance harness (TypeScript side).
 *
 * Reads the SAME shared `conformance/*.html` fixtures and `conformance/expected.json`
 * that the Python engine's `tests/test_conformance.py` reads, runs the TS `audit()`,
 * and asserts identical score + sorted-unique rule ids for every fixture.
 *
 * `expected.json` is the single source of truth, generated from the Python engine.
 * If the TS engine ever diverges (as it did on heading-order), this test fails loudly.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { audit } from './audit.js'

// Resolve the shared conformance dir relative to THIS file, so the test is
// location-independent:
//   coralos-ts/packages/agent-runtime/src/wcag/ -> repo root -> conformance/
const HERE = dirname(fileURLToPath(import.meta.url))
const CONFORMANCE = resolve(HERE, '../../../../../conformance')

interface Expected {
  score: number
  rules: string[]
}

const expected: Record<string, Expected> = JSON.parse(
  readFileSync(resolve(CONFORMANCE, 'expected.json'), 'utf-8'),
)

describe('cross-engine WCAG conformance (TS matches Python source-of-truth)', () => {
  for (const filename of Object.keys(expected).sort()) {
    it(`${filename}: matches expected score and rules`, () => {
      const html = readFileSync(resolve(CONFORMANCE, filename), 'utf-8')
      const report = audit(html)

      const gotRules = [...new Set(report.violations.map((v) => v.rule))].sort()
      const expRules = [...expected[filename].rules].sort()

      expect(report.score).toBe(expected[filename].score)
      expect(gotRules).toEqual(expRules)
    })
  }
})
