/**
 * Remediation — apply fixes for a set of violations and return the patched HTML.
 *
 * Fixes are attribute/content edits located by the same `tag[index]` locator the
 * auditor produces, so the verifier can confirm each specific violation is gone.
 * All fixes are applied in one parse; since they never restructure the tree (except
 * appending a <title>, which no other rule indexes), locators stay valid throughout.
 */
import type { HTMLElement } from 'node-html-parser'
import { WcagViolation } from './types.js'
import { parseHtml, collect, locators, tagOf, escapeHtml, setStyleProp } from './dom.js'
import { parseColor, bestContrastColor } from './contrast.js'

function titleize(s: string): string {
  const t = s.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

export interface RemediationResult {
  html: string
  resolved: string[] // violation keys the seller claims to have fixed
}

export function remediate(html: string, violations: WcagViolation[]): RemediationResult {
  const root = parseHtml(html)
  const els = collect(root)
  const loc = locators(els)
  const bySelector = new Map<string, HTMLElement>()
  for (const el of els) bySelector.set(loc.get(el)!, el)

  const resolved: string[] = []

  for (const v of violations) {
    const key = `${v.rule}@${v.selector}`
    let ok = false

    if (v.rule === 'html-lang') {
      const htmlEl = els.find((e) => tagOf(e) === 'html')
      if (htmlEl) { htmlEl.setAttribute('lang', v.fixHint.suggested || 'en'); ok = true }
    } else if (v.rule === 'doc-title') {
      const head = els.find((e) => tagOf(e) === 'head')
      if (head) {
        const title = els.find((e) => tagOf(e) === 'title')
        if (title) title.set_content(escapeHtml(v.fixHint.suggested || 'Untitled Page'))
        else head.set_content((head.innerHTML || '') + `<title>${escapeHtml(v.fixHint.suggested || 'Untitled Page')}</title>`)
        ok = true
      }
    } else {
      const el = bySelector.get(v.selector)
      if (el) {
        if (v.rule === 'img-alt') {
          el.setAttribute('alt', titleize(v.fixHint.src || ''))
          ok = true
        } else if (v.rule === 'form-label') {
          el.setAttribute('aria-label', titleize(v.fixHint.suggested || 'Field'))
          ok = true
        } else if (v.rule === 'control-name' || v.rule === 'link-name') {
          const text = v.fixHint.suggested || 'Action'
          if (!(el.text ?? '').trim()) el.set_content(escapeHtml(text))
          else el.setAttribute('aria-label', text)
          ok = true
        } else if (v.rule === 'contrast') {
          const bg = parseColor(v.fixHint.bg) || [255, 255, 255]
          setStyleProp(el, 'color', bestContrastColor(bg))
          ok = true
        }
      }
    }

    if (ok) resolved.push(key)
  }

  return { html: root.toString(), resolved }
}
