import { describe, expect, it } from 'vitest'
import type { Line } from '../types'
import { defaultFilters, linesOfGroup, lineVisible, SELECT_BUTTONS } from './filter'

const L = (number: number, type: Line['type'], cpt: number, fo: number, comment = '', over: Partial<Line> = {}): Line =>
  ({ number, type, comment, eligible: { captain: cpt > 0, firstOfficer: fo > 0 }, days: [], tripInstances: [], ...over }) as unknown as Line

describe('filters', () => {
  const lines = [
    L(500, 'flying', 1, 1),
    L(501, 'flying', 0, 1, 'THIS LINE FOR BID BY FIRST OFFICER ONLY'),
    L(741, 'gateway-standby', 1, 1),
    L(810, 'vto', 1, 0),
    L(820, 'vtor', 1, 0),
    L(795, 'reserve', 1, 1),
    L(796, 'shiftable-reserve', 1, 1),
  ]

  it('hides lines the seat cannot hold, by header counts not comment text', () => {
    expect(lines.filter((l) => lineVisible(l, defaultFilters)).map((l) => l.number)).toEqual([500, 741, 810, 820, 795, 796])
    expect(lines.filter((l) => lineVisible(l, { ...defaultFilters, seat: 'firstOfficer' })).map((l) => l.number)).toEqual([500, 501, 741, 795, 796])
  })

  it('keeps VTO and VTOR out of the Flying and RSV filters', () => {
    expect(lineVisible(lines[3], { ...defaultFilters, hidden: ['flying'] })).toBe(true) // VTO stays when Flying is hidden
    expect(lineVisible(lines[4], { ...defaultFilters, hidden: ['flying'] })).toBe(true)
    expect(lineVisible(lines[4], { ...defaultFilters, hidden: ['reserve'] })).toBe(true) // VTOR stays when RSV is hidden
    expect(lineVisible(lines[3], { ...defaultFilters, hidden: ['reserve'] })).toBe(true)
    expect(lineVisible(lines[0], { ...defaultFilters, hidden: ['flying'] })).toBe(false)
    expect(lineVisible(lines[5], { ...defaultFilters, hidden: ['reserve'] })).toBe(false)
  })

  it('hides VTO and VTOR separately and searches number or comment', () => {
    expect(lineVisible(lines[3], { ...defaultFilters, hidden: ['vto'] })).toBe(false)
    expect(lineVisible(lines[4], { ...defaultFilters, hidden: ['vto'] })).toBe(true)
    expect(lineVisible(lines[4], { ...defaultFilters, hidden: ['vtor'] })).toBe(false)
    expect(lineVisible(lines[1], { ...defaultFilters, seat: 'firstOfficer', search: 'first officer' })).toBe(true)
    expect(lineVisible(lines[0], { ...defaultFilters, search: '74' })).toBe(false)
  })

  it('hides lines the IPA Snapshot marks unavailable only when asked', () => {
    const hold = new Map([[500, { status: 'unavailable' }], [741, { status: 'available' }]])
    expect(lineVisible(lines[0], defaultFilters, hold)).toBe(true)
    expect(lineVisible(lines[0], { ...defaultFilters, hideUnavailable: true }, hold)).toBe(false)
    expect(lineVisible(lines[2], { ...defaultFilters, hideUnavailable: true }, hold)).toBe(true)
    expect(lineVisible(lines[3], { ...defaultFilters, hideUnavailable: true }, hold)).toBe(true) // not on your bid: unknown, kept
  })

  it('selects all VTO, all VTOR and all RSV lines for the Move Lines menu', () => {
    expect(linesOfGroup(lines, 'vto')).toEqual([810])
    expect(linesOfGroup(lines, 'vtor')).toEqual([820])
    expect(linesOfGroup(lines, 'reserve')).toEqual([795, 796])
  })

  it('selects the other Move Lines groups: split VTO, RA/RB/SA/SB, HS and gateway standby', () => {
    const day = (kind: string) => ({ date: '2026-12-01', kind })
    const more = [
      L(717, 'vto', 1, 0, '', { days: [day('VTO'), day('trip')] as unknown as Line['days'], tripInstances: [{ tripId: '5001' }] as unknown as Line['tripInstances'] }),
      L(724, 'base-trip', 1, 1, '', { days: [day('VTO'), day('trip')] as unknown as Line['days'] }),
      L(741, 'gateway-standby', 1, 1, '', { days: [day('GS'), day('VTO')] as unknown as Line['days'] }),
      L(742, 'gateway-standby', 1, 1, '', { days: [day('GS')] as unknown as Line['days'] }),
      L(733, 'hot-standby', 1, 1, '', { days: [day('HS')] as unknown as Line['days'] }),
      L(760, 'reserve', 1, 1, '', { days: [day('RA')] as unknown as Line['days'] }),
      L(761, 'reserve', 1, 1, '', { days: [day('RB')] as unknown as Line['days'] }),
      L(762, 'shiftable-reserve', 1, 1, '', { days: [day('SA')] as unknown as Line['days'] }),
      L(763, 'shiftable-reserve', 1, 1, '', { days: [day('SB')] as unknown as Line['days'] }),
      L(810, 'vto', 1, 0, '', { days: [day('VTO')] as unknown as Line['days'] }),
    ]
    // split VTO = part VTO and part flying trips or gateway standby; the all-VTO line 810 is not split
    expect(linesOfGroup(more, 'splitVto')).toEqual([717, 724, 741])
    expect(linesOfGroup(more, 'vto')).toEqual([717, 810])
    expect(linesOfGroup(more, 'gwy')).toEqual([741, 742])
    expect(linesOfGroup(more, 'hs')).toEqual([733])
    expect([linesOfGroup(more, 'ra'), linesOfGroup(more, 'rb'), linesOfGroup(more, 'sa'), linesOfGroup(more, 'sb')]).toEqual([[760], [761], [762], [763]])
    expect(SELECT_BUTTONS.map((b) => b.label)).toEqual(['All VTO', 'Split VTO', 'All VTOR', 'All RSV', 'RA', 'RB', 'SA', 'SB', 'HS', 'GWY-STBY'])
  })

  it('searches by trip number as well as line number and comment', () => {
    const l = L(505, 'flying', 1, 1, '', { tripInstances: [{ tripId: '5253' }, { tripId: '5164' }] as unknown as Line['tripInstances'] })
    expect(lineVisible(l, { ...defaultFilters, search: '5253' })).toBe(true)
    expect(lineVisible(l, { ...defaultFilters, search: '516' })).toBe(true)
    expect(lineVisible(l, { ...defaultFilters, search: '9999' })).toBe(false)
  })

  it('a gateway standby line with VTO days stays visible unless both GWY-STBY and VTO are hidden', () => {
    const day = (kind: string) => ({ date: '2026-12-01', kind })
    const split = L(741, 'gateway-standby', 1, 1, '', { days: [day('GS'), day('VTO')] as unknown as Line['days'] })
    const plain = L(742, 'gateway-standby', 1, 1, '', { days: [day('GS')] as unknown as Line['days'] })
    expect(lineVisible(split, { ...defaultFilters, hidden: ['standby'] })).toBe(true) // VTO is not hidden
    expect(lineVisible(split, { ...defaultFilters, hidden: ['vto'] })).toBe(true) // GWY-STBY is not hidden
    expect(lineVisible(split, { ...defaultFilters, hidden: ['standby', 'vto'] })).toBe(false)
    expect(lineVisible(plain, { ...defaultFilters, hidden: ['standby'] })).toBe(false) // a plain gateway line still hides
  })
})
