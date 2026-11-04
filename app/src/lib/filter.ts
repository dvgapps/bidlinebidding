import type { Line, LineType, Seat } from '../types'

export type TypeGroup = 'flying' | 'reserve' | 'standby' | 'vto' | 'vtor'

export const TYPE_GROUPS: { id: TypeGroup; label: string; types: LineType[] }[] = [
  // VTO lines count as flying; VTOR lines count as reserve (a line is hidden when any group it belongs to is hidden)
  { id: 'flying', label: 'Flying', types: ['flying', 'base-trip', 'vto'] },
  { id: 'reserve', label: 'RSV', types: ['reserve', 'shiftable-reserve', 'reserve-recovery', 'vtor'] },
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

/** Lines of the `TYPE_GROUPS` entry for the Move Lines menu: all VTO, all VTOR, all RSV. */
/** Exactly the line types each Move Lines shortcut selects (All VTO, All VTOR and All RSV do not overlap). */
const SELECT_TYPES: Record<TypeGroup, LineType[]> = {
  flying: ['flying', 'base-trip'],
  reserve: ['reserve', 'shiftable-reserve', 'reserve-recovery'],
  standby: ['hot-standby', 'gateway-standby'],
  vto: ['vto'],
  vtor: ['vtor'],
}
export const linesOfGroup = (lines: Line[], group: TypeGroup): number[] =>
  lines.filter((l) => SELECT_TYPES[group].includes(l.type)).map((l) => l.number)

export type SortKey = 'number' | 'pay' | 'do' | 'dd' | 'tb' | 'tc' | 'intl' | 'tafb' | 'wknd' | 'sat' | 'sun' | 'dto' | 'hold'
