/** WCAG engine types + per-rule bounty weights (used to price the accessibility work). */

export type WcagRule =
  | 'doc-title'
  | 'html-lang'
  | 'img-alt'
  | 'form-label'
  | 'control-name'
  | 'link-name'
  | 'contrast'

export interface WcagViolation {
  rule: WcagRule
  criterion: string
  severity: 'critical' | 'serious' | 'moderate'
  selector: string
  message: string
  fixHint: Record<string, string>
}

export interface WcagReport {
  violations: WcagViolation[]
  score: number
}

export const RULE_WEIGHTS: Record<WcagRule, number> = {
  'img-alt': 20,
  contrast: 30,
  'form-label': 30,
  'control-name': 25,
  'link-name': 20,
  'html-lang': 10,
  'doc-title': 10,
}

export function weight(rule: WcagRule): number {
  return RULE_WEIGHTS[rule] ?? 10
}

export function violationKey(v: WcagViolation): string {
  return `${v.rule}@${v.selector}`
}
