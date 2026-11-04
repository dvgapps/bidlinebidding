/** Shape of the JSON bundle written by tools/ingest (schema 1). */

export type DayKind = 'off' | 'trip' | 'HS' | 'GS' | 'RA' | 'RB' | 'SA' | 'SB' | 'VTO' | 'VTOR'

export type LineType =
  | 'flying'
  | 'base-trip'
  | 'reserve'
  | 'shiftable-reserve'
  | 'reserve-recovery'
  | 'hot-standby'
  | 'gateway-standby'
  | 'vto'
  | 'vtor'

export type LegKind = 'flight' | 'deadhead-company' | 'deadhead-commercial' | 'ground' | 'hot-standby'

export interface Leg {
  day: number
  flight: string
  kind: LegKind
  dep: string
  arr: string
  startUtc: string
  startLocalHour: number
  endUtc: string
  endLocalHour: number
  startMin: number
  endMin: number
  block: number
  aircraft: string
  iro: boolean
  cxn: number | null
}

export interface Duty {
  reportUtc: string
  reportLocalHour: number
  reportMin: number
  reportLead: number
  releaseUtc: string | null
  releaseMin: number | null
  duty: number | null
  block: number | null
  rest: number | null
  restNote: string | null
  credit: number | null
  creditCode: string | null
  legs: Leg[]
}

export interface Trip {
  id: string
  type: 'flying' | 'hot-standby' | 'gateway-standby'
  lines: number[]
  reportUtc: string
  reportDates: string[]
  reportDatesActual: string[]
  openDates: string[]
  openOnly: boolean
  duties: Duty[]
  overnights: string[]
  credit: number
  creditCode: string
  block: number
  duty: number
  tafb: number
  premium: number
  perDiem: number
  landings: number
}

export interface TripInstance {
  tripId: string
  startDate: string
  endDate: string
  reportUtc: string
  credit: string | null
  ppCredit: string | null
}

export interface PPStats {
  id: string
  label: string
  start: string
  ct: string | null
  bt: string | null
  do: number | null
  dd: number | null
}

export interface Line {
  number: number
  comment: string
  seats: { captain: number; firstOfficer: number; other: number }
  eligible: { captain: boolean; firstOfficer: boolean }
  type: LineType
  page: number
  pp: PPStats[]
  days: { date: string; kind: DayKind; tripId?: string }[]
  tripInstances: TripInstance[]
}

export interface Bundle {
  schema: number
  bidPeriod: {
    id: string
    domicile: string
    fleet: string
    seat: string
    tz: string
    generated: string
    startLocal: string
    endLocal: string
    pp: { id: string; startLocal: string; endLocal: string }[]
  }
  trips: Trip[]
  airports: Record<string, { icao: string | null; country: string | null; intl: boolean | null }>
  lines: Line[]
  checks: Record<string, number>
}

export type Seat = 'captain' | 'firstOfficer'
