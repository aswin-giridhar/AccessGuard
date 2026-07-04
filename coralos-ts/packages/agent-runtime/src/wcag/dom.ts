/**
 * Shared DOM helpers for the WCAG engine.
 *
 * The auditor and the remediator parse the SAME source string, so element order is
 * identical and a `tag[index]` locator produced by one is resolvable by the other.
 * That shared, stable locator is what lets the verifier confirm a specific fix.
 */
import { parse, HTMLElement, NodeType } from 'node-html-parser'

export function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: true, blockTextElements: { script: true, style: true } })
}

/** All element nodes in document order (depth-first). */
export function collect(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  const walk = (n: HTMLElement) => {
    for (const c of n.childNodes) {
      if ((c as HTMLElement).nodeType === NodeType.ELEMENT_NODE) {
        const el = c as HTMLElement
        out.push(el)
        walk(el)
      }
    }
  }
  walk(root)
  return out
}

/** Map each element to a stable `tag[index]` locator (index among same-tag elements). */
export function locators(els: HTMLElement[]): Map<HTMLElement, string> {
  const counts: Record<string, number> = {}
  const map = new Map<HTMLElement, string>()
  for (const el of els) {
    const tag = el.tagName?.toLowerCase() ?? '?'
    const i = counts[tag] ?? 0
    counts[tag] = i + 1
    map.set(el, `${tag}[${i}]`)
  }
  return map
}

export function tagOf(el: HTMLElement): string {
  return el.tagName?.toLowerCase() ?? ''
}

/** Accessible name (best-effort): visible text, then common naming attributes. */
export function accessibleText(el: HTMLElement): string {
  const txt = (el.text ?? '').trim()
  if (txt) return txt
  for (const attr of ['aria-label', 'title', 'alt', 'value']) {
    const v = el.getAttribute(attr)
    if (v && v.trim()) return v.trim()
  }
  const img = el.querySelector('img')
  if (img && img.getAttribute('alt')) return String(img.getAttribute('alt')).trim()
  return ''
}

export function hasAncestor(el: HTMLElement, tag: string): boolean {
  let p = el.parentNode as HTMLElement | null
  while (p && p.nodeType === NodeType.ELEMENT_NODE) {
    if (tagOf(p) === tag) return true
    p = p.parentNode as HTMLElement | null
  }
  return false
}

export function parseStyle(el: HTMLElement): Record<string, string> {
  const raw = el.getAttribute('style') ?? ''
  const out: Record<string, string> = {}
  for (const decl of raw.split(';')) {
    const i = decl.indexOf(':')
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim()
  }
  return out
}

export function setStyleProp(el: HTMLElement, prop: string, value: string): void {
  const style = parseStyle(el)
  style[prop.toLowerCase()] = value
  el.setAttribute('style', Object.entries(style).map(([k, v]) => `${k}: ${v}`).join('; '))
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * True if page text is predominantly Chinese (CJK Han) characters. Makes 3.1.1 language
 * checks meaningful for the Chinese-speaking commons: a Chinese page with a missing or wrong
 * `lang` breaks screen-reader pronunciation and language rendering for zh users.
 */
export function isCjkDominant(text: string): boolean {
  const han = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return han >= 4 && han >= latin
}

// Representative characters that differ between the scripts. A heuristic, not a full
// converter: counts script-exclusive characters and picks the majority. Ambiguous → 'zh'.
const ZH_SIMP = '们这国学东车电语说读体应观厅买卖为华旧时会员见长门问间关义书头实现发报让认识讲谢试严单处备复够继续网罗广湾'
const ZH_TRAD = '們這國學東車電語說讀體應觀廳買賣為華舊時會員見長門問間關義書頭實現發報讓認識講謝試嚴單處備複夠繼續網羅廣灣'

/** Best-effort Simplified vs Traditional Chinese tag: 'zh-Hans' | 'zh-Hant' | 'zh' (ambiguous). */
export function detectZhVariant(text: string): 'zh' | 'zh-Hans' | 'zh-Hant' {
  let simp = 0
  let trad = 0
  for (const ch of text) {
    if (ZH_SIMP.includes(ch)) simp++
    else if (ZH_TRAD.includes(ch)) trad++
  }
  if (trad > simp) return 'zh-Hant'
  if (simp > trad) return 'zh-Hans'
  return 'zh'
}
