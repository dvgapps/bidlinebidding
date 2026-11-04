import { describe, expect, it } from 'vitest'
import type { TripInstance } from '../types'
import { carryFromLine } from './carry'

const inst = (startDate: string, endDate: string): TripInstance => ({ tripId: 'x', startDate, endDate, reportUtc: '10:00', credit: null, ppCredit: null })

describe('carryFromLine', () => {
  it('keeps only trips still running at the new period start, cut to that start', () => {
    const r = carryFromLine(
      { tripInstances: [inst('2026-12-20', '2026-12-24'), inst('2027-01-20', '2027-01-25'), inst('2027-01-23', '2027-01-24'), inst('2027-01-12', '2027-01-16')] },
      '2027-01-24',
    )
    expect(r).toEqual([
      { start: '2027-01-24', end: '2027-01-24' },
      { start: '2027-01-24', end: '2027-01-25' },
    ])
  })
  it('is empty when nothing crosses the boundary', () => {
    expect(carryFromLine({ tripInstances: [inst('2026-12-01', '2026-12-05')] }, '2027-01-24')).toEqual([])
  })
})
