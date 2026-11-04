import { describe, expect, it } from 'vitest'
import { holdLabel, holdMap, holdScore, snapshotMismatch, type IpaSnapshot } from './ipa'

const snap: IpaSnapshot = {
  updated: '11/04/26 at 11:35z',
  holding: 813,
  seniorBids: 251,
  rows: [
    { choice: 1, line: 818, status: 'unavailable' },
    { choice: 2, line: 813, status: 'current' },
    { choice: 3, line: 800, status: 'available' },
    { choice: 4, line: 795, status: 'available', count: 2 },
  ],
}

describe('hold helpers', () => {
  const m = holdMap(snap)
  it('maps lines to their status and ranks them for sorting', () => {
    expect(holdScore(m.get(813))).toBe(3)
    expect(holdScore(m.get(800))).toBe(2)
    expect(holdScore(m.get(501))).toBe(1) // not on your bid: unknown
    expect(holdScore(m.get(818))).toBe(0)
    expect(holdMap(null).size).toBe(0)
  })
  it('labels', () => {
    expect(holdLabel(m.get(813))).toBe('Holding')
    expect(holdLabel(m.get(800))).toBe('✓')
    expect(holdLabel(m.get(795))).toBe('✓ 2')
    expect(holdLabel(m.get(818))).toBe('✕')
    expect(holdLabel(undefined)).toBe('–')
  })
  it('detects a snapshot from another bid period', () => {
    expect(snapshotMismatch(snap, new Set([818, 813, 800, 795]))).toBe(0)
    expect(snapshotMismatch(snap, new Set([500, 501]))).toBe(4)
    expect(snapshotMismatch(null, new Set())).toBe(0)
  })
})
