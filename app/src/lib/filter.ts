import type { DayKind, Line, LineType, Seat } from '../types'

export type TypeGroup = 'flying' | 'reserve' | 'standby' | 'vto' | 'vtor'

export const TYPE_GROUPS: { id: TypeGroup; label: string; types: LineType[] }[] = [
  // every line type is in exactly one group, so VTO and VTOR lines are shown or hidden on their own
  { id: 'flying', label: 'Flying', types: ['flying', 'base-trip'] },
  { id: 'reserve', label: 'RSV', types: ['reserve', 'shiftable-reserve', 'reserve-recovery'] },
  { id: 'standby', label: 'GWY-STBY', types: ['hot-standby', 'gateway-standby'] },
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
  if (q && !String(line.number).includes(q) && !line.comment.toLowerCase().includes(q.toLowerCase()) && !line.tripInstances.some((t) => t.tripId.includes(q))) return false
  return true
}

/** The line-type buttons of the Move Lines pane. */
export type SelectKey = 'vto' | 'splitVto' | 'vtor' | 'reserve' | 'ra' | 'rb' | 'sa' | 'sb' | 'hs' | 'gwy'

const hasDay = (l: Line, kind: DayKind) => l.days.some((d) => d.kind === kind)

const SELECT: Record<SelectKey, (l: Line) => boolean> = {
  vto: (l) => l.type === 'vto',
  // a split VTO line: one pay period is VTO and the other has flying trips (lines 717-723 in bid 2701)
  splitVto: (l) => l.type === 'vto' && l.tripInstances.length > 0,
  vtor: (l) => l.type === 'vtor',
  reserve: (l) => l.type === 'reserve' || l.type === 'shiftable-reserve' || l.type === 'reserve-recovery',
  ra: (l) => hasDay(l, 'RA'),
  rb: (l) => hasDay(l, 'RB'),
  sa: (l) => hasDay(l, 'SA'),
  sb: (l) => hasDay(l, 'SB'),
  hs: (l) => l.type === 'hot-standby',
  gwy: (l) => l.type === 'gateway-standby',
}

export const SELECT_BUTTONS: { key: SelectKey; label: string; title: string }[] = [
  { key: 'vto', label: 'All VTO', title: 'Every VTO line' },
  { key: 'splitVto', label: 'Split VTO', title: 'VTO lines with a pay period of flying (a VTO pay period plus a flying pay period)' },
  { key: 'vtor', label: 'All VTOR', title: 'Every VTOR line' },
  { key: 'reserve', label: 'All RSV', title: 'Reserve, shiftable reserve and reserve recovery lines' },
  { key: 'ra', label: 'RA', title: 'Lines with RA days' },
  { key: 'rb', label: 'RB', title: 'Lines with RB days' },
  { key: 'sa', label: 'SA', title: 'Lines with SA days' },
  { key: 'sb', label: 'SB', title: 'Lines with SB days' },
  { key: 'hs', label: 'HS', title: 'Hot standby lines' },
  { key: 'gwy', label: 'GWY-STBY', title: 'Gateway standby lines' },
]

export const linesOfGroup = (lines: Line[], key: SelectKey): number[] => lines.filter(SELECT[key]).map((l) => l.number)

export type SortKey =
  | 'number' | 'pay' | 'do' | 'dd' | 'tb' | 'tc' | 'intl' | 'tafb' | 'wknd' | 'sat' | 'sun' | 'dto' | 'hold'
  // the Sort pane
  | 'commHome' | 'commWork' | 'commBoth' | 'commutes' | 'trips' | 'baseTrip' | 'carryOut' | 'edw' | 'tdt'
