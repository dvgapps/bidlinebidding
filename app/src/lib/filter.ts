import type { Line, LineType, Seat } from '../types'

export type TypeGroup = 'flying' | 'reserve' | 'standby' | 'vto' | 'vtor'

export const TYPE_GROUPS: { id: TypeGroup; label: string; types: LineType[] }[] = [
  // every line type is in exactly one group, so VTO and VTOR lines are shown or hidden on their own
  { id: 'flying', label: 'Flying', types: ['flying', 'base-trip'] },
  { id: 'reserve', label: 'RSV', types: ['reserve', 'shiftable-reserve', 'reserve-recovery'] },
  { id: 'standby', label: 'Standby', types: ['hot-standby', 'gateway-standby'] },
  { id: 'vto', label: 'VTO', types: ['vto'] },
  { id: 'vtor', label: 'VTOR', types: ['vtor'] },
]

export interface Filters {
  seat: Seat
  /** hidden groups */
  hidden: TypeGroup[]
  search: string
  /** hide lines the IPA Snapshot says you cannot hold */
  hideUnavailable: boolean
}

export const defaultFilters: Filters = { seat: 'captain', hidden: [], search: '', hideUnavailable: false }

export function lineVisible(line: Line, f: Filters, hold?: Map<number, { status: string }>): boolean {
  if (!line.eligible[f.seat]) return false
  if (f.hideUnavailable && hold?.get(line.number)?.status === 'unavailable') return false
  if (TYPE_GROUPS.some((g) => g.types.includes(line.type) && f.hidden.includes(g.id))) return false
  const q = f.search.trim()
  if (q && !String(line.number).includes(q) && !line.comment.toLowerCase().includes(q.toLowerCase())) return false
  return true
}

/** Lines of one `TYPE_GROUPS` entry (the Move Lines shortcuts: all VTO, all VTOR, all RSV). */
export const linesOfGroup = (lines: Line[], group: TypeGroup): number[] => {
  const types = TYPE_GROUPS.find((g) => g.id === group)!.types
  return lines.filter((l) => types.includes(l.type)).map((l) => l.number)
}

export type SortKey =
  | 'number' | 'pay' | 'do' | 'dd' | 'tb' | 'tc' | 'intl' | 'tafb' | 'wknd' | 'sat' | 'sun' | 'dto' | 'hold'
  // the Sort pane
  | 'commHome' | 'commWork' | 'commBoth' | 'commutes' | 'trips' | 'baseTrip' | 'carryOut' | 'edw' | 'tdt'
