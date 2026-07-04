/**
 * Track-record input for award decisions. The feed server derives per-seller reputation from the
 * run ledger (/api/reputation); the buyer folds it into the best-value prompt so history — not
 * just price — shapes who wins. Feed down -> undefined -> awards work exactly as before.
 */
import { formatReputation, type SellerReputation } from '@pay/agent-runtime'

/** Raw per-seller track record from the feed's /api/reputation, or undefined if unavailable. */
export async function fetchReputation(url: string, doFetch: typeof fetch = fetch): Promise<SellerReputation[] | undefined> {
  try {
    const res = await doFetch(url)
    if (!res.ok) return undefined
    const body = (await res.json()) as { reputation?: SellerReputation[] } | null
    return body?.reputation?.length ? body.reputation : undefined
  } catch {
    return undefined
  }
}

export async function fetchReputationLines(url: string, doFetch: typeof fetch = fetch): Promise<string | undefined> {
  const reps = await fetchReputation(url, doFetch)
  return reps ? formatReputation(reps) : undefined
}

/** seller -> score map for the deterministic best-value fallback. */
export function reputationScores(reps: SellerReputation[] | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of reps ?? []) out[r.seller] = r.score
  return out
}
