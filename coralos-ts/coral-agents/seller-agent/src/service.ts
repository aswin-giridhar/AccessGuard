/**
 * Seller services.
 *
 * `accessguard` — the headline product: audit a page against the deterministic WCAG engine, remediate
 * it, and return the WCAG-fixed HTML. The verifier re-audits independently and only a genuine,
 * regression-free improvement releases the escrow. Seller quality tiers (generalist vs pro) make the
 * personas compete on value, not just price.
 * `freelance` — the generic LLM worker: the brief goes to the LLM, the deliverable comes back as JSON.
 * Without an LLM key it returns an error payload, which the verifier fails — no-capability sellers
 * don't get released.
 * `txline` — the inherited starter-kit example (a verified TxLINE fair-line read for a fixture).
 */
import { complete, parseJsonReply, resolvePage, audit, remediate } from '@pay/agent-runtime'

const TXLINE_BASE = process.env.TXLINE_BASE_URL || 'https://txline-dev.txodds.com'

export async function deliverService(request: string): Promise<string> {
  const [first, ...rest] = request.trim().split(/\s+/).filter(Boolean)
  const service = (first ?? 'accessguard').toLowerCase()
  if (service === 'accessguard') return accessguardService(rest.join(' '))
  if (service === 'freelance') return freelanceService(rest.join(' '))
  if (service === 'txline') return txlineService(rest.join(' '))
  return JSON.stringify({ error: 'unsupported service', service, supported: ['accessguard', 'freelance', 'txline'] })
}

/**
 * `accessguard` — the accessibility remediation product. The seller resolves the page named by
 * the WANT arg, audits it against the deterministic WCAG engine, applies fixes, and returns the
 * patched HTML plus the fixes it claims. The verifier re-audits independently and only a genuine
 * improvement (no regressions) releases the escrow.
 *
 * ACCESSGUARD_LAZY=1 makes a no-capability seller return the page UNCHANGED — an honest no-op the
 * verifier fails, so its escrow refunds. (The kit's "no-pay path is a feature", made objective.)
 */
async function accessguardService(arg: string): Promise<string> {
  const page = (arg || '').trim()
  // Seller quality tier — a real product difference, not just a price tag:
  //   'generalist' (seller-a11y)     covers the high-impact critical/serious barriers;
  //   'pro'        (seller-a11y-pro)  fixes everything, including lower-severity issues.
  // Both still clear the verifier gate (resolved > 0, no regressions); the premium tier just
  // delivers a higher score, so the buyer's best-value choice genuinely trades price vs. quality.
  const tier = (process.env.ACCESSGUARD_TIER || 'pro').toLowerCase()
  try {
    const original = await resolvePage(page)
    if (process.env.ACCESSGUARD_LAZY === '1') {
      return JSON.stringify({ service: 'accessguard', arg: page, tier, scoreBefore: 0, scoreAfter: 0, resolved: [], fixed: original })
    }
    const before = audit(original)
    const toFix = (tier === 'generalist' || tier === 'basic')
      ? before.violations.filter((v) => v.severity === 'critical' || v.severity === 'serious')
      : before.violations
    const { html: fixed, resolved } = remediate(original, toFix)
    const after = audit(fixed)
    return JSON.stringify({
      service: 'accessguard', arg: page, tier,
      scoreBefore: before.score, scoreAfter: after.score,
      resolved, remaining: after.violations.length, fixed,
    })
  } catch (e) {
    return JSON.stringify({ service: 'accessguard', arg: page, tier, error: `remediation failed: ${(e as Error).message}` })
  }
}

async function freelanceService(brief: string): Promise<string> {
  try {
    const text = await complete({
      system:
        'You are a freelance agent delivering a PAID order. Produce the deliverable for the brief. ' +
        'Reply ONLY with JSON: {"deliverable": <string or object>, "notes": "<under 15 words>"}.',
      user: `Brief: ${brief || 'unspecified'}`,
      maxTokens: 700,
    })
    const parsed = parseJsonReply<{ deliverable?: unknown; notes?: string }>(text)
    return JSON.stringify({
      service: 'freelance', brief,
      result: parsed ?? { deliverable: text.trim() },
    })
  } catch (e) {
    // No LLM -> an honest error payload; the verifier fails it and the escrow is never released.
    return JSON.stringify({ service: 'freelance', brief, error: `llm unavailable: ${(e as Error).message}` })
  }
}

async function txlineGet(path: string): Promise<unknown> {
  const apiToken = process.env.TXLINE_API_KEY
  if (!apiToken) return { error: 'TXLINE_API_KEY not set - run the one-time subscribe (see examples/txodds)' }
  const auth = await fetch(`${TXLINE_BASE}/auth/guest/start`, { method: 'POST' })
  if (!auth.ok) return { error: `txline auth ${auth.status}` }
  const jwt = ((await auth.json()) as { token: string }).token
  const res = await fetch(`${TXLINE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken },
  })
  if (!res.ok) return { error: `txline ${path} ${res.status}` }
  return res.json()
}

async function txlineService(request: string): Promise<string> {
  const tokens = request.trim().split(/\s+/).filter(Boolean)
  let action = (tokens[0] ?? 'fixtures').toLowerCase()
  let fixtureId = tokens[1]
  if (/^\d+$/.test(action)) {
    fixtureId = action
    action = 'edge'
  }

  switch (action) {
    case 'odds':
      return JSON.stringify({ service: 'txline-odds', fixtureId, odds: await txlineGet(`/api/odds/snapshot/${fixtureId}`) })
    case 'edge':
      return txlineEdge(fixtureId)
    case 'fixtures':
    default: {
      const fixtures = await txlineGet('/api/fixtures/snapshot')
      const list = Array.isArray(fixtures) ? fixtures : []
      return JSON.stringify({ service: 'txline-fixtures', count: list.length, fixtures: list.slice(0, 10) })
    }
  }
}

async function txlineEdge(fixtureId: string | undefined): Promise<string> {
  const [odds, fixtures] = await Promise.all([
    txlineGet(`/api/odds/snapshot/${fixtureId}`),
    txlineGet('/api/fixtures/snapshot'),
  ])
  const market = Array.isArray(odds)
    ? (odds as Array<Record<string, unknown>>).find((x) => String(x.SuperOddsType ?? '').includes('1X2'))
    : undefined
  const fx = Array.isArray(fixtures)
    ? (fixtures as Array<Record<string, unknown>>).find((f) => String(f.FixtureId) === String(fixtureId))
    : undefined
  const teams = fx ? { home: fx.Participant1, away: fx.Participant2, competition: fx.Competition } : undefined
  const matchup = teams ? `${teams.home} v ${teams.away}` : `fixture ${fixtureId}`

  const analysis = await liveReadOrFallback(matchup, odds, market, teams)
  return JSON.stringify({ service: 'txline-edge', fixtureId, teams, market, analysis })
}

async function liveReadOrFallback(
  matchup: string,
  odds: unknown,
  market: Record<string, unknown> | undefined,
  teams: Record<string, unknown> | undefined,
): Promise<unknown> {
  try {
    const text = await complete({
      system: 'You are a football trading analyst. Reply only as JSON {"call": string, "confidence": number}.',
      user:
        `For ${matchup}, make a one-line value read from these de-margined World Cup odds. ` +
        `Odds: ${JSON.stringify(odds).slice(0, 1500)}`,
      maxTokens: 180,
    })
    return parseJsonReply(text) ?? { call: text }
  } catch (e) {
    return deterministicRead(market, teams, (e as Error).message)
  }
}

function deterministicRead(
  market: Record<string, unknown> | undefined,
  teams: Record<string, unknown> | undefined,
  reason: string,
): unknown {
  const names = (market?.PriceNames ?? []) as string[]
  const pcts = (market?.Pct ?? []) as string[]
  let bestIndex = -1
  let bestPct = -1
  names.forEach((_, i) => {
    const pct = Number(pcts[i])
    if (Number.isFinite(pct) && pct > bestPct) {
      bestPct = pct
      bestIndex = i
    }
  })
  if (bestIndex < 0) return { call: 'odds unavailable', note: `deterministic fallback: ${reason}` }
  const raw = names[bestIndex]
  const label = raw === 'part1'
    ? (teams?.home ?? 'Home')
    : raw === 'part2'
      ? (teams?.away ?? 'Away')
      : 'Draw'
  return {
    call: `Odds favour ${label} (${bestPct.toFixed(0)}%)`,
    confidence: Number((bestPct / 100).toFixed(2)),
    note: `deterministic fallback: ${reason}`,
  }
}
