/**
 * Delivery verification - the verifier's brain, pure and network-optional so it's fully testable.
 *
 * Deterministic checks decide first (they cannot be prompt-injected):
 *   1. content hash — the payload must hash to the sha the buyer received (payment binds to THIS artifact)
 *   2. structure    — the payload must be JSON and not a top-level error report
 *   3. domain gate  — for `accessguard`, a DETERMINISTIC WCAG re-audit (see acceptAccessibility):
 *                     release only if the delivery objectively improves the page with no regressions.
 * Only for services without a domain gate does the (optional) LLM acceptance judge get a say; if it is
 * unavailable, the deterministic checks stand. Mirrors decideBid: the model proposes, code enforces.
 */
import { sha256Hex, complete, parseJsonReply, resolvePage, acceptAccessibility, type VerifyRequest, type Verdict, type CompleteOpts } from '@pay/agent-runtime'

type Llm = (opts: CompleteOpts) => Promise<string>

export async function checkDelivery(req: VerifyRequest, name: string, llm: Llm = complete): Promise<Verdict> {
  const base = { round: req.round, by: name, sha: sha256Hex(req.payload) }

  if (base.sha !== req.sha) {
    return { ...base, verdict: 'fail', reason: 'content hash mismatch' }
  }

  let data: unknown
  try {
    data = JSON.parse(req.payload)
  } catch {
    return { ...base, verdict: 'fail', reason: 'payload is not JSON' }
  }
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    const err = String((data as Record<string, unknown>).error).slice(0, 40)
    return { ...base, verdict: 'fail', reason: `payload reports error: ${err}` }
  }

  // AccessGuard: a domain-specific, DETERMINISTIC acceptance oracle. The verifier re-fetches the same
  // baseline the buyer asked about and re-audits the delivered HTML — payment releases iff the fix is a
  // real, regression-free accessibility improvement. No LLM opinion; it cannot be prompt-injected.
  if (req.service === 'accessguard') {
    try {
      const baseline = await resolvePage(req.arg)
      const fixed = String((data as Record<string, unknown>).fixed ?? '')
      const v = acceptAccessibility(baseline, fixed)
      return { ...base, verdict: v.pass ? 'pass' : 'fail', reason: v.reason.slice(0, 60) }
    } catch (e) {
      return { ...base, verdict: 'fail', reason: `accessguard check failed: ${(e as Error).message}`.slice(0, 60) }
    }
  }

  try {
    const parsed = parseJsonReply<{ pass?: boolean; reason?: string }>(await llm({
      system:
        'You are an impartial delivery verifier for a paid agent marketplace. Given an order and the ' +
        'delivered payload, judge whether the payload plausibly fulfils the order. Reply ONLY with ' +
        'JSON: {"pass": boolean, "reason": string}. Keep reason under 10 words.',
      user: `order: service=${req.service} arg=${req.arg}\ndelivered payload: ${req.payload.slice(0, 1500)}`,
      maxTokens: 120,
    }))
    if (parsed?.pass === false) return { ...base, verdict: 'fail', reason: (parsed.reason ?? 'judged unacceptable').slice(0, 60) }
    if (parsed?.pass === true) return { ...base, verdict: 'pass', reason: (parsed.reason ?? 'checks passed').slice(0, 60) }
  } catch {
    // judge unavailable -> the deterministic checks above decide
  }
  return { ...base, verdict: 'pass', reason: 'hash + structure verified' }
}
