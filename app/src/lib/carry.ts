import type { Line } from '../types'
import type { DateRange } from './dto'

/**
 * Carry-in: trips of the line you were awarded in the previous bid period that are still running when the new
 * period starts. Returns the days of those trips that fall on or after `newStart` (ISO date).
 */
export function carryFromLine(prev: Pick<Line, 'tripInstances'>, newStart: string): DateRange[] {
  const out: DateRange[] = []
  for (const t of prev.tripInstances) {
    if (t.endDate < newStart) continue
    out.push({ start: t.startDate < newStart ? newStart : t.startDate, end: t.endDate })
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0))
}
