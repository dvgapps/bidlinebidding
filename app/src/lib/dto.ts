import type { Line } from '../types'
import { isOff } from './metrics'

/** A range of desired days off, inclusive, ISO dates (YYYY-MM-DD). */
export interface DateRange {
  start: string
  end: string
}

export const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const clampIso = (iso: string, lo: string, hi: string): string => (iso < lo ? lo : iso > hi ? hi : iso)

/** Chronological order: by start, then end. */
export const sortRanges = (r: DateRange[]): DateRange[] =>
  [...r].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0))

/**
 * Change the start date; the end follows to the same date (the user may then extend it). The end can
 * never be before the start, so an end that is earlier than the new start is also moved up.
 */
export function setStart(_r: DateRange, start: string): DateRange {
  return { start, end: start }
}

export function setEnd(r: DateRange, end: string): DateRange {
  return { start: r.start, end: end < r.start ? r.start : end }
}

/** The list with range `i` changed (start and/or end), in chronological order; null when there is no such range. */
export function patchRangeAt(ranges: DateRange[], i: number, patch: { start?: string; end?: string }): DateRange[] | null {
  let r = ranges[i]
  if (!r) return null
  if (patch.start) r = setStart(r, patch.start)
  if (patch.end) r = setEnd(r, patch.end)
  return sortRanges(ranges.map((x, k) => (k === i ? r : x)))
}

/** Every desired date, once each, even when ranges overlap. */
export function desiredDates(ranges: DateRange[]): Set<string> {
  const out = new Set<string>()
  for (const r of ranges) {
    for (let d = r.start; d <= r.end; d = addDays(d, 1)) out.add(d)
  }
  return out
}

export interface DtoResult {
  /** share of desired dates that are off on this line, 0..1; null when no dates are desired */
  pct: number | null
  off: number
  conflicts: number
  total: number
}

/** DTO: how many of the desired dates are days off on the line. Dates outside the package are ignored. */
export function computeDto(line: Line, desired: Set<string>): DtoResult {
  let off = 0
  let conflicts = 0
  for (const d of line.days) {
    if (!desired.has(d.date)) continue
    if (isOff(d.kind)) off++
    else conflicts++
  }
  const total = off + conflicts
  return { pct: total ? off / total : null, off, conflicts, total }
}

export const formatRange = (r: DateRange): string => {
  const f = (iso: string) =>
    new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return r.start === r.end ? f(r.start) : `${f(r.start)} – ${f(r.end)}`
}
