import { describe, expect, it } from 'vitest'
import type { DayKind, Line } from '../types'
import { addDays, computeDto, desiredDates, formatRange, setEnd, setStart, sortRanges } from './dto'

const line = (kinds: Record<number, DayKind>): Line =>
  ({
    days: Array.from({ length: 56 }, (_, i) => ({ date: addDays('2026-11-29', i), kind: kinds[i] ?? 'off' })),
  }) as unknown as Line

describe('date ranges', () => {
  it('start change drags the end to the same date; end can never precede the start', () => {
    const r = { start: '2026-12-10', end: '2026-12-14' }
    expect(setStart(r, '2026-12-20')).toEqual({ start: '2026-12-20', end: '2026-12-20' })
    expect(setStart(r, '2026-12-01')).toEqual({ start: '2026-12-01', end: '2026-12-01' })
    expect(setEnd(r, '2026-12-18')).toEqual({ start: '2026-12-10', end: '2026-12-18' })
    expect(setEnd(r, '2026-12-01')).toEqual({ start: '2026-12-10', end: '2026-12-10' })
  })
  it('orders chronologically by start then end', () => {
    const got = sortRanges([
      { start: '2027-01-02', end: '2027-01-04' },
      { start: '2026-12-24', end: '2026-12-26' },
      { start: '2026-12-24', end: '2026-12-25' },
    ])
    expect(got.map((r) => r.end)).toEqual(['2026-12-25', '2026-12-26', '2027-01-04'])
  })
  it('expands to a set without duplicates and formats', () => {
    const s = desiredDates([{ start: '2026-12-24', end: '2026-12-26' }, { start: '2026-12-26', end: '2026-12-27' }])
    expect([...s].sort()).toEqual(['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27'])
    expect(formatRange({ start: '2026-12-24', end: '2026-12-24' })).toBe('Dec 24')
    expect(formatRange({ start: '2026-12-24', end: '2026-12-26' })).toBe('Dec 24 – Dec 26')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('DTO', () => {
  const desired = desiredDates([{ start: '2026-12-24', end: '2026-12-27' }]) // idx 25..28
  it('is the share of desired dates that are off', () => {
    const r = computeDto(line({ 26: 'trip', 27: 'RA' }), desired)
    expect(r).toEqual({ pct: 0.5, off: 2, conflicts: 2, total: 4 })
  })
  it('counts VTO days as off and ignores dates outside the package', () => {
    expect(computeDto(line({ 25: 'VTO' }), desiredDates([{ start: '2026-12-24', end: '2026-12-24' }, { start: '2030-01-01', end: '2030-01-02' }])).pct).toBe(1)
  })
  it('is null with no desired dates', () => {
    expect(computeDto(line({}), new Set()).pct).toBeNull()
  })
})
