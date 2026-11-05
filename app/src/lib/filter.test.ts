import { describe, expect, it } from 'vitest'
import type { Line } from '../types'
import { defaultFilters, linesOfGroup, lineVisible } from './filter'

const L = (number: number, type: Line['type'], cpt: number, fo: number, comment = ''): Line =>
  ({ number, type, comment, eligible: { captain: cpt > 0, firstOfficer: fo > 0 } }) as unknown as Line

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
})
