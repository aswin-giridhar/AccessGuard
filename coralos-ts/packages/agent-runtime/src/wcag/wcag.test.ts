import { describe, it, expect } from 'vitest'
import { audit } from './audit.js'
import { remediate } from './remediate.js'
import { acceptAccessibility } from './accept.js'
import { FIXTURES } from './pages.js'
import { contrastRatio, parseColor, bestContrastColor } from './contrast.js'

describe('wcag audit', () => {
  it('is deterministic — same HTML, same score', () => {
    const html = FIXTURES['council-parking']
    expect(audit(html).score).toBe(audit(html).score)
    expect(audit(html).violations.length).toBe(audit(html).violations.length)
  })

  it('flags the seeded barriers on the council fixture', () => {
    const rules = audit(FIXTURES['council-parking']).violations.map((v) => v.rule)
    expect(rules).toContain('doc-title')
    expect(rules).toContain('html-lang')
    expect(rules).toContain('img-alt')
    expect(rules).toContain('form-label')
    expect(rules).toContain('control-name')
    expect(rules).toContain('link-name')
    expect(rules).toContain('contrast')
  })

  it('gives a clean page a perfect score', () => {
    const html = '<!DOCTYPE html><html lang="en"><head><title>Home</title></head><body><h1>Hi</h1></body></html>'
    expect(audit(html).score).toBe(100)
    expect(audit(html).violations).toHaveLength(0)
  })

  it('flags lang mismatch on a Chinese page (serves the zh commons)', () => {
    const langViol = audit(FIXTURES['city-services-zh']).violations.find((v) => v.rule === 'html-lang')
    expect(langViol).toBeDefined()
    expect(langViol!.message).toMatch(/Chinese/)
    expect(langViol!.fixHint.suggested).toBe('zh-Hant')
  })

  it('distinguishes Simplified from Traditional (zh-Hans vs zh-Hant)', () => {
    const trad = audit(FIXTURES['city-services-zh']).violations.find((v) => v.rule === 'html-lang')
    const hans = audit(FIXTURES['city-services-hans']).violations.find((v) => v.rule === 'html-lang')
    expect(trad!.fixHint.suggested).toBe('zh-Hant')
    expect(hans!.fixHint.suggested).toBe('zh-Hans')
  })

  it('remediates a Chinese page to a clean score (lang -> zh-Hant)', () => {
    const html = FIXTURES['city-services-zh']
    const before = audit(html)
    const { html: fixed } = remediate(html, before.violations)
    const v = acceptAccessibility(html, fixed)
    expect(v.pass).toBe(true)
    expect(fixed).toMatch(/lang="zh-Hant"/)
  })
})

describe('contrast maths', () => {
  it('computes the canonical black/white ratio (21:1)', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1)
  })
  it('parses hex, rgb and named colours', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255])
    expect(parseColor('rgb(0,0,0)')).toEqual([0, 0, 0])
    expect(parseColor('white')).toEqual([255, 255, 255])
  })
  it('picks the higher-contrast text colour', () => {
    expect(bestContrastColor([255, 255, 255])).toBe('#000000')
    expect(bestContrastColor([0, 0, 0])).toBe('#ffffff')
  })
})

describe('remediate + accept (the settlement gate)', () => {
  it('a real fix passes the verifier and raises the score', () => {
    const html = FIXTURES['council-parking']
    const before = audit(html)
    const { html: fixed, resolved } = remediate(html, before.violations)
    expect(resolved.length).toBeGreaterThan(0)
    const v = acceptAccessibility(html, fixed)
    expect(v.pass).toBe(true)
    expect(v.scoreAfter).toBeGreaterThan(v.scoreBefore)
    expect(v.introduced).toHaveLength(0)
  })

  it('a no-op (unchanged page) FAILS — no pay', () => {
    const html = FIXTURES['nhs-appointment']
    const v = acceptAccessibility(html, html)
    expect(v.pass).toBe(false)
    expect(v.reason).toMatch(/no violations resolved/)
  })

  it('a delivery that introduces a NEW violation FAILS — no pay', () => {
    const html = FIXTURES['tax-portal']
    // strip everything: removes some violations but the empty doc still lacks title/lang etc.
    const broken = '<html><head></head><body><img src="x.png"><p style="color:#eee;background-color:#fff">x</p></body></html>'
    const v = acceptAccessibility(html, broken)
    expect(v.pass).toBe(false)
  })
})
