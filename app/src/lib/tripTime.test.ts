import { describe, expect, it } from 'vitest'
import type { Line, Trip } from '../types'
import { layoverLabels, localWeekdayHour, nyDate, reportInstantMs, toneOfLegKind, utcDay } from './tripTime'

describe('trip instants', () => {
  it('finds the report instant for the domicile-local start date', () => {
    // 06:30Z on 8 Dec is 01:30 EST on 8 Dec
    expect(nyDate(reportInstantMs({ reportUtc: '06:30' }, '2026-12-08')!)).toBe('2026-12-08')
    // 02:00Z on 9 Dec is 21:00 EST on 8 Dec, so a trip starting on the 8th reports at Zulu 9 Dec
    expect(new Date(reportInstantMs({ reportUtc: '02:00' }, '2026-12-08')!).toISOString()).toBe('2026-12-09T02:00:00.000Z')
  })
  it('formats BidPro DAY and local weekday/hour', () => {
    const ms = Date.UTC(2026, 11, 13, 12, 11) // Sunday 13 Dec, 12:11Z
    expect(utcDay(ms)).toBe('SU13')
    expect(localWeekdayHour(ms, 7)).toBe('SU07') // SDF
    // 02:00Z Tuesday 15 Dec is Monday 19:00 on the US west coast
    expect(localWeekdayHour(Date.UTC(2026, 11, 15, 3, 34), 19)).toBe('MO19')
  })
  it('colours a layover airport by how the pilot arrived', () => {
    expect(toneOfLegKind('deadhead-company')).toBe('company-dh')
    expect(toneOfLegKind('deadhead-commercial')).toBe('commercial')
    expect(toneOfLegKind('ground')).toBe('commercial')
    expect(toneOfLegKind('flight')).toBe('plain')
  })
})

describe('layoverLabels: overnight gateway standby', () => {
  // PHL standby: report 00:00Z (19:00 EST the evening before) to 07:00Z (02:00 EST), repeated every 24 h for four duties
  const duties = [0, 1, 2, 3].map((k) => ({ reportMin: 24 * 60 * k, releaseMin: 24 * 60 * k + 7 * 60, legs: [{ arr: 'PHL', kind: 'hot-standby' }] }))
  const trip = { id: '6063', type: 'gateway-standby', reportUtc: '00:00', overnights: ['PHL', 'PHL', 'PHL'], duties } as unknown as Trip
  const line = { tripInstances: [{ tripId: '6063', startDate: '2026-11-30', endDate: '2026-12-04' }] } as unknown as Line
  it('labels every standby day with the gateway, not just some', () => {
    const m = layoverLabels(line, new Map([['6063', trip]]))
    // first report 00:00Z on 1 Dec = 19:00 EST on 30 Nov
    expect([...m.keys()].sort()).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
    expect([...m.values()].every((v) => v.text === 'PHL')).toBe(true)
  })
})

describe('layoverLabels', () => {
  // trip reporting 12:00Z (07:00 EST) Mon 7 Dec, three duties
  const trip = {
    id: '9001',
    reportUtc: '12:00',
    overnights: ['CGN', 'PVG'],
    duties: [
      { reportMin: 0, releaseMin: 8 * 60, legs: [{ arr: 'CGN', kind: 'flight' }] },
      { reportMin: 62 * 60, releaseMin: 70 * 60, legs: [{ arr: 'PVG', kind: 'deadhead-commercial' }] },
      { reportMin: 96 * 60, releaseMin: 102 * 60, legs: [{ arr: 'SDF', kind: 'flight' }] },
    ],
  } as unknown as Trip
  const line = { tripInstances: [{ tripId: '9001', startDate: '2026-12-07', endDate: '2026-12-11' }] } as unknown as Line

  it('puts the airport on the night it starts and L/O on the whole days in between', () => {
    const m = layoverLabels(line, new Map([['9001', trip]]))
    // duty 1 releases 20:00Z = 15:00 EST Dec 7; duty 2 reports 62h later = 02:00Z Dec 10 = 21:00 EST Dec 9
    expect(m.get('2026-12-07')).toEqual({ text: 'CGN', tone: 'plain' })
    expect(m.get('2026-12-08')).toEqual({ text: 'L/O', tone: 'lo' })
    expect(m.get('2026-12-09')).toEqual({ text: 'L/O', tone: 'lo' }) // the day duty 2 reports is still the layover
    // duty 2 releases 10:00Z Dec 10 = 05:00 EST Dec 10; duty 3 reports 12:00Z Dec 11 (Dec 11 EST)
    expect(m.get('2026-12-10')).toEqual({ text: 'PVG', tone: 'commercial' })
    // the last duty ends at the base: the return airport is shown on the last day
    expect(m.get('2026-12-11')).toEqual({ text: 'SDF', tone: 'plain' })
  })

  it('labels a same-day hotel layover (rest of 10:30 or more) and lets it win over the return label', () => {
    // trip 5082 style: out and back in one local day with a long sit at PHX
    const t = {
      id: '5082',
      reportUtc: '12:00',
      overnights: ['PHX'],
      duties: [
        { reportMin: 0, releaseMin: 300, legs: [{ arr: 'PHX', kind: 'flight' }] },
        { reportMin: 990, releaseMin: 1260, legs: [{ arr: 'SDF', kind: 'deadhead-commercial' }] },
      ],
    } as unknown as Trip
    const l = { tripInstances: [{ tripId: '5082', startDate: '2027-01-02', endDate: '2027-01-02' }] } as unknown as Line
    expect(layoverLabels(l, new Map([['5082', t]])).get('2027-01-02')).toEqual({ text: 'PHX', tone: 'plain' })
  })
})
