import { describe, expect, it } from 'vitest'
import type { Duty, Line, Trip } from '../types'
import { computeLineMetrics, type LineMetrics } from './metrics'
import { sortByCriteria, sortValue, type SortCtx } from './sorting'
import { isEdwDuty } from './tripTime'

const metric = (over: Partial<LineMetrics>): LineMetrics => ({ tcPP: [4500, 4500], ...over }) as LineMetrics

const ctx = (rows: Record<number, Partial<LineMetrics>>, dto: Record<number, number> = {}): SortCtx => ({
  metrics: new Map(Object.entries(rows).map(([n, m]) => [Number(n), metric(m)])),
  dto: new Map(Object.entries(dto).map(([n, pct]) => [Number(n), { pct }])) as unknown as SortCtx['dto'],
  hold: new Map(),
})

describe('multi-level sort', () => {
  const c = ctx({
    1: { doPrinted: 14, payMin: 9000 },
    2: { doPrinted: 12, payMin: 9500 },
    3: { doPrinted: 14, payMin: 9800 },
    4: { doPrinted: 14, payMin: 9000 },
  })
  it('sorts by the first criterion, then orders the ties by the next', () => {
    const out = sortByCriteria([1, 2, 3, 4], [{ key: 'do', dir: 'desc' }, { key: 'pay', dir: 'desc' }], c)
    expect(out).toEqual([3, 1, 4, 2]) // DO 14 first, highest pay first among them; lines 1 and 4 tie fully and keep their order
  })
  it('honours Lo to Hi on each level separately', () => {
    expect(sortByCriteria([1, 2, 3, 4], [{ key: 'do', dir: 'asc' }, { key: 'pay', dir: 'desc' }], c)).toEqual([2, 3, 1, 4])
  })
  it('puts lines without a value last, whichever direction', () => {
    const d = ctx({ 1: {}, 2: {}, 3: {} }, { 1: 0.5, 3: 0.9 }) // line 2 has no desired-dates result
    expect(sortValue('dto', 2, d)).toBeNull()
    expect(sortByCriteria([1, 2, 3], [{ key: 'dto', dir: 'desc' }], d)).toEqual([3, 1, 2])
    expect(sortByCriteria([1, 2, 3], [{ key: 'dto', dir: 'asc' }], d)).toEqual([1, 3, 2])
  })
})

describe('Early Duty Window (02:30-04:59 local domicile time)', () => {
  // 2026-12-07 is standard time: local = UTC - 5. Trip reports at 07:30Z = 02:30 local.
  const rep = Date.UTC(2026, 11, 7, 7, 30)
  const duty = (reportMin: number, blockInMin: number, releaseMin: number) =>
    ({ reportMin, releaseMin, legs: [{ endMin: blockInMin }] }) as unknown as Duty
  it('counts a duty that reports in the window', () => expect(isEdwDuty(rep, duty(0, 300, 330))).toBe(true))
  it('counts a duty that overlaps the window', () => {
    // reports 21:00Z (16:00 local) on the 7th, blocks in 08:00Z (03:00 local) on the 8th
    expect(isEdwDuty(rep, duty(13 * 60 + 30, 24 * 60 + 30, 24 * 60 + 60))).toBe(true)
  })
  it('does not count a daytime duty', () => expect(isEdwDuty(rep, duty(4 * 60 + 30, 8 * 60 + 30, 9 * 60))).toBe(false))
  it('does not count a duty that blocks in before the window and is only released inside it', () => {
    // reports 18:00Z (13:00 local), blocks in 07:20Z (02:20 local) next day, released 07:50Z (02:50)
    expect(isEdwDuty(rep, duty(10 * 60 + 30, 24 * 60 - 10, 24 * 60 + 20))).toBe(false)
  })
})

describe('commuting, carry-out credit and duty time', () => {
  const START = Date.UTC(2026, 10, 29)
  const days = Array.from({ length: 56 }, (_, i) => ({ date: new Date(START + i * 86400000).toISOString().slice(0, 10), kind: 'off' as const }))
  const leg = (kind: string) => ({ kind, dep: 'SDF', arr: 'ABC', endMin: 100 })
  const mk = (id: string, first: string, last: string): Trip =>
    ({ id, type: 'flying', creditCode: 'D', tafb: 600, duty: 700, reportUtc: '12:00', duties: [{ reportMin: 0, releaseMin: 600, legs: [leg(first)] }, { reportMin: 700, releaseMin: 1300, legs: [leg(last)] }] }) as unknown as Trip
  const trips = new Map([
    ['A', mk('A', 'deadhead-commercial', 'flight')],
    ['B', mk('B', 'flight', 'deadhead-commercial')],
    ['C', mk('C', 'deadhead-commercial', 'deadhead-commercial')],
  ])
  const inst = (tripId: string, startDate: string, endDate: string, credit = '30:00', ppCredit = '30:00') => ({ tripId, startDate, endDate, reportUtc: '12:00', credit, ppCredit })
  const line = {
    number: 500,
    type: 'base-trip',
    pp: [{ ct: '60:00', bt: '40:00', do: 14, dd: 14 }, { ct: '60:00', bt: '40:00', do: 14, dd: 14 }],
    days,
    tripInstances: [
      inst('A', '2026-12-01', '2026-12-04'),
      inst('B', '2026-12-05', '2026-12-08'), // starts the day after A ends: back to back, no commute
      inst('C', '2026-12-10', '2026-12-13'), // a day off in between: another commute
      inst('A', '2027-01-21', '2027-01-27', '40:00', '12:00'), // runs past the end of the bid period (2027-01-23)
    ],
  } as unknown as Line
  const m = computeLineMetrics(line, trips, {})
  it('counts commercial deadheads at the start, the end, and both', () => {
    expect([m.commWork, m.commHome, m.commBoth]).toEqual([3, 2, 1])
  })
  it('does not count back-to-back trips as separate commutes', () => expect(m.commutes).toBe(3))
  it('sums credit that is paid in the next bid period', () => expect(m.carryOutMin).toBe(28 * 60))
  it('adds up total duty time, and flags base trip lines', () => {
    expect(m.tdtMin).toBe(4 * 700)
    expect(m.baseTrip).toBe(1)
  })
})
