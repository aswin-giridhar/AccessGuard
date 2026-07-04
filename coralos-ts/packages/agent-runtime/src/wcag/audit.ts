/**
 * Deterministic WCAG 2.2 audit — the objective oracle the marketplace settles on.
 *
 * Given the same HTML it always returns the same violations, so the verifier's
 * accept/reject (and therefore the escrow release) is reproducible by anyone.
 */
import { WcagReport, WcagViolation, weight } from './types.js'
import {
  parseHtml, collect, locators, tagOf, accessibleText, hasAncestor, parseStyle, isCjkDominant, detectZhVariant,
} from './dom.js'
import { parseColor, contrastRatio } from './contrast.js'

const FORM_SKIP = new Set(['hidden', 'submit', 'button', 'reset', 'image'])

export function audit(html: string): WcagReport {
  const root = parseHtml(html)
  const els = collect(root)
  const loc = locators(els)
  const violations: WcagViolation[] = []

  const add = (
    rule: WcagViolation['rule'], criterion: string, severity: WcagViolation['severity'],
    selector: string, message: string, fixHint: Record<string, string> = {},
  ) => violations.push({ rule, criterion, severity, selector, message, fixHint })

  const htmlEl = els.find((e) => tagOf(e) === 'html')
  const titleEl = els.find((e) => tagOf(e) === 'title')

  // 2.4.2 Page Titled
  if (!titleEl || !(titleEl.text ?? '').trim()) {
    add('doc-title', '2.4.2 Page Titled', 'serious', 'html[0]',
      'Document has no non-empty <title> element.', { suggested: 'Untitled Page' })
  }

  // 3.1.1 Language of Page — CJK-aware (serves the Chinese-speaking commons)
  if (htmlEl) {
    const lang = String(htmlEl.getAttribute('lang') ?? '').trim().toLowerCase()
    const cjk = isCjkDominant(root.text ?? '')
    const suggested = cjk ? detectZhVariant(root.text ?? '') : 'en'
    if (!lang) {
      add('html-lang', '3.1.1 Language of Page', 'serious', 'html[0]',
        '<html> element is missing a lang attribute.', { suggested })
    } else if (cjk && !lang.startsWith('zh')) {
      add('html-lang', '3.1.1 Language of Page', 'serious', 'html[0]',
        `Page content is Chinese but lang="${lang}" declares a different language.`, { suggested })
    }
  }

  // gather label[for] targets once
  const labelledIds = new Set<string>()
  for (const el of els) {
    if (tagOf(el) === 'label') {
      const f = el.getAttribute('for')
      if (f) labelledIds.add(f)
    }
  }

  for (const el of els) {
    const tag = tagOf(el)
    const selector = loc.get(el) ?? `${tag}[?]`

    // 1.1.1 Non-text Content — <img> must have an alt attribute (alt="" allowed)
    if (tag === 'img' && el.getAttribute('alt') === undefined) {
      const src = String(el.getAttribute('src') ?? '').split('/').pop() ?? ''
      add('img-alt', '1.1.1 Non-text Content', 'critical', selector,
        'Image has no alt attribute.', { src })
    }

    // 1.3.1 / 4.1.2 — form controls need an accessible label
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const type = String(el.getAttribute('type') ?? 'text').toLowerCase()
      if (!(tag === 'input' && FORM_SKIP.has(type))) {
        const id = el.getAttribute('id')
        const labelled =
          (id && labelledIds.has(id)) ||
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.getAttribute('title') ||
          hasAncestor(el, 'label')
        if (!labelled) {
          const suggested = (el.getAttribute('name') ?? el.getAttribute('id') ?? tag).replace(/[-_]+/g, ' ')
          add('form-label', '1.3.1 Info and Relationships', 'critical', selector,
            'Form control has no associated label or accessible name.', { suggested })
        }
      }
    }

    // 4.1.2 — buttons need a discernible name
    if (tag === 'button' && !accessibleText(el) && !el.getAttribute('aria-label')) {
      add('control-name', '4.1.2 Name, Role, Value', 'critical', selector,
        'Button has no discernible text.', { suggested: 'Submit' })
    }

    // 2.4.4 — links need discernible text
    if (tag === 'a' && el.getAttribute('href') !== undefined
        && !accessibleText(el) && !el.getAttribute('aria-label')) {
      add('link-name', '2.4.4 Link Purpose', 'serious', selector,
        'Link has no discernible text.', { suggested: 'Learn more' })
    }

    // 1.4.3 — text contrast (only where both colours are set inline; deterministic)
    const style = parseStyle(el)
    const fg = parseColor(style['color'])
    const bg = parseColor(style['background-color'])
    if (fg && bg && (el.text ?? '').trim()) {
      const ratio = contrastRatio(fg, bg)
      if (ratio < 4.5) {
        add('contrast', '1.4.3 Contrast (Minimum)', 'serious', selector,
          `Text contrast ratio ${ratio.toFixed(2)}:1 is below the 4.5:1 minimum.`,
          { fg: style['color'], bg: style['background-color'], ratio: ratio.toFixed(2) })
      }
    }
  }

  // 1.3.1 — heading levels must not skip (e.g. h1 -> h3). Ported from the Python engine
  // so both tracks' oracles score identically.
  let prevLevel = 0
  for (const el of els) {
    const tag = tagOf(el)
    const m = /^h([1-6])$/.exec(tag)
    if (!m) continue
    const level = Number(m[1])
    if (prevLevel && level > prevLevel + 1) {
      add('heading-order', '1.3.1 Info and Relationships', 'moderate', loc.get(el) ?? `${tag}[?]`,
        `Heading level jumps from h${prevLevel} to h${level}, skipping a level.`,
        { expected: String(prevLevel + 1) })
    }
    prevLevel = level
  }

  const penalty = Math.min(violations.reduce((s, v) => s + weight(v.rule), 0), 100)
  return { violations, score: 100 - penalty }
}
