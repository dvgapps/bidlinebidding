import { describe, expect, it } from 'vitest'
import type { DayKind, Line, Trip } from '../types'
import { computeLineMetrics, fmtHM, hm, weekday } from './metrics'

const START = Date.UTC(2026, 10, 29) // Sun 29 Nov 2026

function makeLine(kinds: Record<number, DayKind>, extra: Partial<Line> = {}): Line {
  const days = Array.from({ length: 56 }, (_, i) => ({
    date: new Date(START + i * 86400000).toISOString().slice(0, 10),
    kind: kinds[i] ?? ('off' as DayKind),
  }))
  return {
    number: 500,
    comment: '',
    seats: { captain: 1, firstOfficer: 1, other: 0 },
    eligible: { captain: true, firstOfficer: true },
    type: 'flying',
    page: 3,
    pp: [
      { id: '2613', label: 'PP1', start: '2026-11-29', ct: '80:12', bt: '58:59', do: 13, dd: 13 },
      { id: '2701', label: 'PP2', start: '2026-12-27', ct: '60:00', bt: '40:00', do: 14, dd: 12 },
    ],
    days,
    tripInstances: [],
    ...extra,
  }
}

const trip = (id: string, legs: [string, string][], tafb = 600): Trip =>
  ({
    id,
    type: 'flying',
    creditCode: 'D',
    tafb,
    duties: [
      {
        legs: legs.map(([dep, arr]) => ({ kind: 'flight', dep, arr })),
      },
    ],
  }) as unknown as Trip

describe('time helpers', () => {
  it('parses and formats h:mm', () => {
    expect(hm('62:02')).toBe(3722)
    expect(hm(null)).toBeNull()
    expect(fmtHM(3722)).toBe('62:02')
    expect(fmtHM(null)).toBe('–')
  })
  it('weekday is timezone independent', () => {
    expect(weekday('2026-11-29')).toBe(0)
    expect(weekday('2026-12-05')).toBe(6)
  })
})

describe('computeLineMetrics', () => {
  const none = new Map<string, Trip>()

  it('sums printed stats and floors pay at the line guarantee', () => {
    const m = computeLineMetrics(makeLine({ 3: 'trip' }), none, {})
    expect(m.btMin).toBe(hm('58:59')! + hm('40:00')!)
    expect(m.doPrinted).toBe(27)
    expect(m.ddPrinted).toBe(25)
    expect(m.payMin).toBe(hm('80:12')! + hm('75:00')!) // PP2 60:00 floored to 75:00
  })

  it('shows 75:00 TC and pays 150.0 for a PP with no printed credit (VTO/VTOR/reserve), counting VTO as off', () => {
    const kinds: Record<number, DayKind> = {}
    for (let i = 28; i < 56; i++) kinds[i] = 'VTO'
    const line = makeLine(kinds)
    line.pp[1].ct = null // VTO PPs print no credit
    const m = computeLineMetrics(line, none, {})
    expect(m.tcPP).toEqual([hm('80:12'), 4500])
    expect(m.payMin).toBe(hm('80:12')! + 4500)
    expect(m.daysOff).toBe(56)
  })

  it('computes days off, longest stretch and weekend shares', () => {
    // work Sat 5 Dec (idx 6) and Sun 13 Dec (idx 14)
    const m = computeLineMetrics(makeLine({ 6: 'trip', 14: 'RA' }), none, {})
    expect(m.daysOff).toBe(54)
    expect(m.longestOff).toBe(41) // idx 15..55
    // 8 Saturdays (5,12,19,26 Dec; 2,9,16,23 Jan), 8 Sundays (29 Nov .. 17 Jan)
    expect(m.satOffPct).toBeCloseTo(7 / 8)
    expect(m.sunOffPct).toBeCloseTo(7 / 8)
    // Sat 23 Jan has no Sunday inside the grid, so 7 weekends; Dec 5/6 (Sat worked) and Dec 12/13 (Sun worked) are broken
    expect(m.wkndOffPct).toBeCloseTo(5 / 7)
  })

  it('derives %INTL from flown legs, TAFB and credit codes', () => {
    const trips = new Map<string, Trip>([
      ['1', trip('1', [['SDF', 'CGN'], ['CGN', 'SDF']], 3000)],
      ['2', trip('2', [['SDF', 'YWG'], ['YWG', 'SDF']], 500)],
    ])
    const airports = {
      SDF: { icao: 'KSDF', country: 'UNITEDSTATES', intl: false },
      CGN: { icao: 'EDDK', country: 'GERMANY', intl: true },
      YWG: { icao: 'CYWG', country: 'CANADA', intl: false },
    }
    const line = makeLine(
      { 1: 'trip' },
      {
        tripInstances: [
          { tripId: '1', startDate: '2026-11-30', endDate: '2026-12-01', reportUtc: '10:00', credit: '10:00', ppCredit: null },
          { tripId: '2', startDate: '2026-12-08', endDate: '2026-12-08', reportUtc: '10:00', credit: '6:00', ppCredit: null },
        ],
      },
    )
    const m = computeLineMetrics(line, trips, airports)
    expect(m.intlPct).toBeCloseTo(0.5) // 2 of 4 legs; Canada is not international
    expect(m.tafbMin).toBe(3500)
    expect(m.tripCount).toBe(2)
    expect(m.creditCodes).toEqual(['D'])
  })

  it('has null %INTL when nothing is flown', () => {
    expect(computeLineMetrics(makeLine({}), none, {}).intlPct).toBeNull()
  })
})
