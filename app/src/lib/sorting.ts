import type { DtoResult } from './dto'
import type { SortKey } from './filter'
import { holdScore, type IpaRow } from './ipa'
import type { LineMetrics } from './metrics'
import { sortList } from './rank'

export interface SortCtx {
  metrics: Map<number, LineMetrics>
  dto: Map<number, DtoResult>
  hold: Map<number, IpaRow>
}

export type SortDir = 'asc' | 'desc'

/** One step of a multi-level sort: the first one is the main order, each next one orders lines the earlier ones tie on. */
export interface SortCriterion {
  key: SortKey
  dir: SortDir
}

/** The number a line is sorted by under `key`; null when the line has no value for it (e.g. no desired dates entered). */
export function sortValue(key: SortKey, n: number, ctx: SortCtx): number | null {
  const m = ctx.metrics.get(n)!
  switch (key) {
    case 'number': return n
    case 'pay': return m.payMin
    case 'do': return m.doPrinted
    case 'dd': return m.ddPrinted
    case 'tb': return m.btMin
    case 'tc': return m.tcPP[0] + m.tcPP[1]
    case 'intl': return m.intlPct
    case 'tafb': return m.tafbMin
    case 'wknd': return m.wkndOffPct
    case 'sat': return m.satOffPct
    case 'sun': return m.sunOffPct
    case 'dto': return ctx.dto.get(n)?.pct ?? null
    case 'hold': return holdScore(ctx.hold.get(n))
    case 'commHome': return m.commHome
    case 'commWork': return m.commWork
    case 'commBoth': return m.commBoth
    case 'commutes': return m.commutes
    case 'trips': return m.tripCount
    case 'baseTrip': return m.baseTrip
    case 'carryOut': return m.carryOutMin
    case 'edw': return m.edwPct
    case 'tdt': return m.tdtMin
  }
}

/** The criteria the Sort pane offers, in its groups. `dir` is the direction a newly added criterion starts with. */
export const SORT_GROUPS: { label: string; items: { key: SortKey; label: string; dir: SortDir }[] }[] = [
  {
    label: 'Commuting',
    items: [
      { key: 'commHome', label: 'Commercial to Home', dir: 'asc' },
      { key: 'commWork', label: 'Commercial to Work', dir: 'asc' },
      { key: 'commBoth', label: 'Commercial to Work/Home', dir: 'asc' },
      { key: 'commutes', label: 'Number of commutes', dir: 'asc' },
    ],
  },
  {
    label: 'Days ON/OFF',
    items: [
      { key: 'dto', label: 'Dates OFF', dir: 'desc' },
      { key: 'do', label: 'Days OFF (DO)', dir: 'desc' },
      { key: 'sat', label: '% Saturdays OFF', dir: 'desc' },
      { key: 'sun', label: '% Sundays OFF', dir: 'desc' },
      { key: 'wknd', label: '% Weekends OFF', dir: 'desc' },
      { key: 'trips', label: 'Trips', dir: 'desc' },
    ],
  },
  {
    label: 'Line Types',
    items: [
      { key: 'baseTrip', label: 'Base Trip Line', dir: 'desc' },
      { key: 'carryOut', label: 'Carry-Out Credit', dir: 'desc' },
      { key: 'edw', label: 'EDW Percentage', dir: 'desc' },
      { key: 'intl', label: 'International Percentage', dir: 'desc' },
    ],
  },
  {
    label: 'Pay',
    items: [
      { key: 'pay', label: 'Pay', dir: 'desc' },
      { key: 'tc', label: 'Total Credit', dir: 'desc' },
    ],
  },
  {
    label: 'Work Amount',
    items: [
      { key: 'dd', label: 'Duty Days (DD)', dir: 'desc' },
      { key: 'tafb', label: 'Time Away From Base (TAFB)', dir: 'desc' },
      { key: 'tb', label: 'Total Block (TB)', dir: 'desc' },
      { key: 'tdt', label: 'Total Duty Time (TDT)', dir: 'desc' },
    ],
  },
]

const ITEMS = SORT_GROUPS.flatMap((g) => g.items)
export const criterionLabel = (key: SortKey): string => ITEMS.find((i) => i.key === key)?.label ?? key
export const defaultDir = (key: SortKey): SortDir => ITEMS.find((i) => i.key === key)?.dir ?? 'desc'

/**
 * Sort a list by the criteria in order: the first is the main order, the second orders the lines the first leaves tied, and
 * so on. Lines with no value for a criterion go last. Built on the stable `sortList`: sorting by the last criterion first
 * and the first criterion last gives exactly that order.
 */
export function sortByCriteria(list: number[], criteria: SortCriterion[], ctx: SortCtx): number[] {
  return [...criteria]
    .reverse()
    .reduce((cur, c) => sortList(cur, (n) => sortValue(c.key, n, ctx) ?? (c.dir === 'desc' ? -Infinity : Infinity), c.dir), list)
}
