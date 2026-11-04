import type { DayKind, LineType } from '../types'

export const TYPE_LABEL: Record<LineType, string> = {
  flying: 'Flying',
  'base-trip': 'Base trip',
  reserve: 'Reserve',
  'shiftable-reserve': 'Shiftable',
  'reserve-recovery': 'Res. recovery',
  'hot-standby': 'HS',
  'gateway-standby': 'Gateway',
  vto: 'VTO',
  vtor: 'VTOR',
}

/** CSS class suffix (see index.css `--k-*` tokens) for each line type / day kind. */
export const TYPE_CLASS: Record<LineType, string> = {
  flying: 'trip',
  'base-trip': 'base',
  reserve: 'res',
  'shiftable-reserve': 'shift',
  'reserve-recovery': 'res',
  'hot-standby': 'hs',
  'gateway-standby': 'gs',
  vto: 'vto',
  vtor: 'vto',
}

export const DAY_CLASS: Record<DayKind, string> = {
  off: 'off',
  trip: 'trip',
  HS: 'hs',
  GS: 'gs',
  RA: 'ra',
  RB: 'rb',
  SA: 'sa',
  SB: 'sb',
  VTO: 'vto',
  VTOR: 'vtor',
}

export const DAY_TEXT: Record<DayKind, string> = {
  off: '',
  trip: '',
  HS: 'HS',
  GS: '',
  RA: 'RA',
  RB: 'RB',
  SA: 'SA',
  SB: 'SB',
  VTO: 'VTO',
  VTOR: 'VTR',
}

export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
