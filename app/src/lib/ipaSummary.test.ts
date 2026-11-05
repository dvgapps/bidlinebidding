import { describe, expect, it } from 'vitest'
import type { IpaSnapshot } from './ipa'
import { formatIpaUpdated, ipaSummary, remainingCount } from './ipaSummary'

const snap = (rows: IpaSnapshot['rows'], over: Partial<IpaSnapshot> = {}): IpaSnapshot => ({
  updated: '11/04/26 at 19:35z',
  holding: 800,
  seniorBids: 262,
  rows,
  ...over,
})

describe('IPA summary', () => {
  it('shows the update time in SDF (Eastern) time instead of UTC', () => {
    expect(formatIpaUpdated('11/04/26 at 19:35z')).toBe('11/04/26 14:35 EST') // November: standard time
    expect(formatIpaUpdated('07/04/26 at 19:35z')).toBe('07/04/26 15:35 EDT') // summer: daylight time
    expect(formatIpaUpdated('01/01/27 at 03:05z')).toBe('12/31/26 22:05 EST') // crosses midnight backwards
  })
  it('leaves an unrecognised stamp alone and handles none', () => {
    expect(formatIpaUpdated('yesterday')).toBe('yesterday')
    expect(formatIpaUpdated(null)).toBeNull()
  })
  it('counts the lines of your bid that are still available', () => {
    const rows = [
      { choice: 1, line: 818, status: 'unavailable' as const },
      { choice: 2, line: 813, status: 'current' as const },
      { choice: 3, line: 800, status: 'available' as const },
      { choice: 4, line: 805, status: 'available' as const },
    ]
    expect(remainingCount(snap(rows))).toBe(2)
    expect(remainingCount(null)).toBe(0)
  })
  it('puts it together: time, senior bids and remaining, then Holding', () => {
    const s = snap([{ choice: 1, line: 800, status: 'available' }, { choice: 2, line: 813, status: 'current' }])
    expect(ipaSummary(s)).toBe('IPA 11/04/26 14:35 EST · 262 senior bids, 1 remaining · Holding 800')
    expect(ipaSummary(snap([], { holding: null, seniorBids: null, updated: null }))).toBe('IPA · ? senior bids, 0 remaining · Holding –')
  })
})
