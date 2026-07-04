/**
 * Renders an `accessguard` delivery: the WCAG score jump (before → after) as a red→green track,
 * the seller's quality tier, the barriers it removed, and a collapsible view of the remediated
 * HTML. This is the moment the market pays for — a page that was inaccessible is now conformant,
 * and an independent verifier re-audits the same artifact to the same number, which releases escrow.
 */
interface Remedy {
  rule?: string
  criterion?: string
  action?: string
}

interface AccessGuard {
  service: string
  arg?: string
  tier?: string
  scoreBefore?: number
  scoreAfter?: number
  resolved?: Array<string | Remedy>
  remaining?: number
  fixed?: string
  error?: string
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Number(n) || 0))

function remedyLabel(r: string | Remedy): string {
  if (typeof r === 'string') return r.replace(/@.*$/, '') // "img-alt@img[0]" → "img-alt"
  return r.rule ?? r.criterion ?? r.action ?? 'fix'
}

export function AccessGuardPanel({ audit }: { audit: AccessGuard }) {
  const tier = audit.tier?.toLowerCase()
  const tierClass = tier === 'pro' ? 'ag-tier-pro' : 'ag-tier-generalist'

  if (audit.error) {
    return (
      <div className="ag ag-fail" data-testid="ag-audit">
        <div className="ag-top">
          <span className="ag-kicker">accessibility fix</span>
          {audit.arg && <span className="ag-page">{audit.arg}</span>}
          {tier && <span className={`ag-tier ${tierClass}`}>{tier}</span>}
        </div>
        <p className="ag-err">Remediation failed — {audit.error}. No improvement, so the escrow refunds.</p>
      </div>
    )
  }

  const before = clamp(audit.scoreBefore)
  const after = clamp(audit.scoreAfter)
  const improved = after > before
  const resolved = audit.resolved ?? []
  const gain = Math.max(0, after - before)

  return (
    <div className="ag" data-testid="ag-audit" data-improved={improved}>
      <div className="ag-top">
        <span className="ag-kicker">accessibility fix</span>
        {audit.arg && <span className="ag-page">{audit.arg}</span>}
        {tier && <span className={`ag-tier ${tierClass}`}>{tier}</span>}
      </div>

      <div className="ag-hero">
        <div className="ag-score ag-score-before">
          <span className="ag-num" data-testid="ag-before">{before}</span>
          <span className="ag-lbl">before</span>
        </div>
        <div>
          <div
            className="ag-track"
            role="img"
            aria-label={`WCAG score rose from ${before} to ${after} out of 100`}
            style={{ ['--before' as string]: `${before}%` }}
          >
            <div className="ag-track-gain" style={{ left: `${before}%`, width: `${gain}%` }} />
          </div>
          <div className="ag-scale"><span>0</span><span>WCAG 2.2 / 100</span><span>100</span></div>
        </div>
        <div className="ag-score ag-score-after">
          <span className="ag-num" data-testid="ag-after">{after}</span>
          <span className="ag-lbl">after</span>
        </div>
      </div>

      <p className="ag-meta">
        <strong>{resolved.length}</strong> {resolved.length === 1 ? 'barrier' : 'barriers'} removed
        {audit.remaining != null && ` · ${audit.remaining === 0 ? 'none remaining' : `${audit.remaining} remaining`}`}
      </p>
      {resolved.length > 0 && (
        <ul className="ag-fixes" data-testid="ag-fixes">
          {resolved.map((r, i) => (
            <li key={i} className="ag-fix">{remedyLabel(r)}</li>
          ))}
        </ul>
      )}

      {audit.fixed && (
        <details className="ag-html">
          <summary>View the remediated HTML the verifier re-audited</summary>
          <pre>{audit.fixed}</pre>
        </details>
      )}
    </div>
  )
}
