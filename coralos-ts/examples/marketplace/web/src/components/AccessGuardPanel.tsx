/**
 * Renders an `accessguard` delivery: the WCAG score jump (before → after), the fixes the seller
 * applied, and a collapsible view of the remediated HTML. This is the moment the market pays for —
 * a page that was inaccessible is now conformant, and an independent verifier can re-audit the same
 * artifact to the same number, which is what releases the escrow.
 */
interface Remedy {
  rule?: string
  criterion?: string
  action?: string
}

interface AccessGuard {
  service: string
  arg?: string
  scoreBefore?: number
  scoreAfter?: number
  resolved?: Array<string | Remedy>
  remaining?: number
  fixed?: string
  error?: string
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Number(n) || 0))

function remedyLabel(r: string | Remedy): string {
  if (typeof r === 'string') return r
  return r.rule ?? r.criterion ?? r.action ?? 'fix'
}

export function AccessGuardPanel({ audit }: { audit: AccessGuard }) {
  if (audit.error) {
    return (
      <div className="ag-panel ag-panel-fail" data-testid="ag-audit">
        <div className="ag-head">♿ accessguard{audit.arg ? ` · ${audit.arg}` : ''}</div>
        <p className="ag-err">remediation failed: {audit.error}</p>
      </div>
    )
  }

  const before = clamp(audit.scoreBefore)
  const after = clamp(audit.scoreAfter)
  const improved = after > before
  const resolved = audit.resolved ?? []

  return (
    <div className="ag-panel" data-testid="ag-audit" data-improved={improved}>
      <div className="ag-head">♿ accessguard{audit.arg ? ` · ${audit.arg}` : ''}</div>

      <div className="ag-scores">
        <span className="ag-score ag-before" data-testid="ag-before">{before}</span>
        <span className="ag-arrow">→</span>
        <span className="ag-score ag-after" data-testid="ag-after">{after}</span>
        <span className="ag-scale">/ 100 WCAG</span>
      </div>
      <div className="ag-bar">
        <div className="ag-fill-before" style={{ width: `${before}%` }} />
        <div className="ag-fill-after" style={{ width: `${after}%` }} />
      </div>

      {resolved.length > 0 && (
        <ul className="ag-fixes" data-testid="ag-fixes">
          {resolved.map((r, i) => (
            <li key={i} className="ag-fix">{remedyLabel(r)}</li>
          ))}
        </ul>
      )}
      {audit.remaining != null && (
        <p className="ag-remaining">
          {audit.remaining === 0 ? 'no violations remaining' : `${audit.remaining} issue(s) remaining`}
        </p>
      )}

      {audit.fixed && (
        <details className="ag-html">
          <summary>view remediated HTML</summary>
          <pre>{audit.fixed}</pre>
        </details>
      )}
    </div>
  )
}
