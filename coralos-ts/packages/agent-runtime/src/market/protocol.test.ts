import { describe, it, expect } from 'vitest'
import {
  formatWant, parseWant, formatBid, parseBid, formatAward, parseAward,
  formatEscrowRequired, parseEscrowRequired, formatDeposited, parseDeposited,
  selectBids, pickCheapest, pickBestValue, verb, messageRound,
  type Bid,
} from './protocol.js'

describe('WANT round-trip', () => {
  it('formats and parses', () => {
    const w = { round: 7, service: 'helius-risk', arg: '7jwB', budgetSol: 0.001 }
    expect(parseWant(formatWant(w))).toEqual(w)
  })
  it('rejects a non-WANT', () => {
    expect(parseWant('BID round=7 price=0.0003 by=x')).toBeNull()
  })
})

describe('BID round-trip', () => {
  it('formats and parses with a free-text note', () => {
    const b = { round: 7, priceSol: 0.0006, by: 'seller-premium', note: 'verified, fresh pull' }
    expect(parseBid(formatBid(b))).toEqual(b)
  })
  it('parses without a note', () => {
    expect(parseBid('BID round=3 price=0.0002 by=seller-cheap')).toEqual({
      round: 3, priceSol: 0.0002, by: 'seller-cheap',
    })
  })
})

describe('AWARD + ESCROW_REQUIRED round-trip', () => {
  it('AWARD', () => {
    expect(parseAward(formatAward(9, 'seller-cheap'))).toEqual({ round: 9, to: 'seller-cheap' })
  })
  it('AWARD round-trips the optional reason', () => {
    const msg = formatAward(9, 'seller-cheap', 'best value')
    expect(msg).toContain('reason="best value"')
    expect(parseAward(msg)).toEqual({ round: 9, to: 'seller-cheap', reason: 'best value' })
  })
  it('ESCROW_REQUIRED', () => {
    const t = { round: 9, reference: 'R3f', seller: 'SeLLeRwa11et', amountSol: 0.0006, deadlineSecs: 600, settlement: 'arbiter' as const }
    expect(parseEscrowRequired(formatEscrowRequired(t))).toEqual(t)
  })
  it('DEPOSITED', () => {
    const d = { round: 9, reference: 'R3f', buyer: 'BuYeRwa11et', sig: '5h2abc', settlement: 'arbiter' as const, vault: 'VaU1t', arbiter: 'ArB1t3r' }
    expect(parseDeposited(formatDeposited(d))).toEqual(d)
  })
})

describe('selection', () => {
  const bids: Bid[] = [
    { round: 7, priceSol: 0.0006, by: 'premium' },
    { round: 7, priceSol: 0.0003, by: 'cheap' },
    { round: 6, priceSol: 0.0001, by: 'cheap' }, // different round - excluded
    { round: 7, priceSol: 0.0002, by: 'cheap' }, // cheap re-bids; last wins
  ]
  it('selectBids filters by round and dedupes by seller (last wins)', () => {
    const r7 = selectBids(bids, 7)
    expect(r7).toHaveLength(2)
    expect(r7.find((b) => b.by === 'cheap')?.priceSol).toBe(0.0002)
  })
  it('pickCheapest picks the lowest price', () => {
    expect(pickCheapest(selectBids(bids, 7))?.by).toBe('cheap')
  })
})

describe('pickBestValue', () => {
  it('with no history it prefers the cheaper bid', () => {
    const pool: Bid[] = [
      { round: 1, priceSol: 0.0006, by: 'pro' },
      { round: 1, priceSol: 0.0003, by: 'gen' },
    ]
    expect(pickBestValue(pool)?.by).toBe('gen')
  })

  it('a strong track record can outweigh a small price gap', () => {
    const pool: Bid[] = [
      { round: 1, priceSol: 0.0006, by: 'pro' },
      { round: 1, priceSol: 0.0003, by: 'gen' },
    ]
    // pro has a perfect record, gen has a poor one; reputation flips the winner.
    expect(pickBestValue(pool, { reputation: { pro: 100, gen: 0 } })?.by).toBe('pro')
  })

  it('breaks ties toward the seller with fewer session wins (distributes work)', () => {
    const pool: Bid[] = [
      { round: 1, priceSol: 0.0003, by: 'a' },
      { round: 1, priceSol: 0.0003, by: 'b' },
    ]
    // equal price + equal reputation: a already won twice, so b should win the tie.
    expect(pickBestValue(pool, { awards: { a: 2, b: 0 } })?.by).toBe('b')
  })

  it('on a full tie falls back to arrival order (latency), then name', () => {
    const pool: Bid[] = [
      { round: 1, priceSol: 0.0003, by: 'later' },
      { round: 1, priceSol: 0.0003, by: 'earlier' },
    ]
    // identical value/awards -> first in the pool (arrived first) wins.
    expect(pickBestValue(pool)?.by).toBe('later')
  })

  it('is deterministic for identical inputs', () => {
    const pool: Bid[] = [
      { round: 1, priceSol: 0.0004, by: 'x' },
      { round: 1, priceSol: 0.0005, by: 'y' },
    ]
    const opts = { reputation: { x: 60, y: 90 }, awards: { x: 1 } }
    expect(pickBestValue(pool, opts)?.by).toBe(pickBestValue(pool, opts)?.by)
  })
})

describe('helpers', () => {
  it('verb + messageRound', () => {
    expect(verb('WANT round=7 ...')).toBe('WANT')
    expect(messageRound('BID round=42 price=0.1 by=x')).toBe(42)
  })
})
