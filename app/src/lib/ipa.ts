import { apiCall, type SyncConfig } from './sync'

/** Status of a line you bid, for your seniority, from the IPA Snapshot (an aid, not authority). */
type IpaStatus = 'available' | 'unavailable' | 'current'

export interface IpaRow {
  choice: number
  line: number
  status: IpaStatus
  count?: number
}

export interface IpaSnapshot {
  updated: string | null
  holding: number | null
  seniorBids: number | null
  rows: IpaRow[]
}

interface IpaResponse {
  fetchedAt: number | null
  cached: boolean
  stale?: boolean
  warning?: string
  snapshot: IpaSnapshot | null
}

export const fetchIpa = (cfg: SyncConfig): Promise<IpaResponse> => apiCall<IpaResponse>(cfg.url, cfg.token, '/api/ipa')

export const holdMap = (s: IpaSnapshot | null): Map<number, IpaRow> => new Map((s?.rows ?? []).map((r) => [r.line, r]))

/** Sort key: currently held > available > not on the snapshot (unknown) > unavailable. */
export const holdScore = (r: IpaRow | undefined): number =>
  !r ? 1 : r.status === 'current' ? 3 : r.status === 'available' ? 2 : 0

/** How many snapshot lines are not in the loaded package (a sign it belongs to another bid period). */
export const snapshotMismatch = (s: IpaSnapshot | null, lineNumbers: Set<number>): number =>
  (s?.rows ?? []).filter((r) => !lineNumbers.has(r.line)).length

/** CSS class that colours the line number: green when the line is holdable, purple when it is the one you hold. */
export const holdLineClass = (r: IpaRow | undefined): string => (r?.status === 'available' || r?.status === 'current' ? `hl-${r.status}` : '')

/** Text inside the Holding-column marker: the word, the number of times a holdable line is on your bid (shown inside the green circle), or nothing for a plain green circle. */
export const holdLabel = (r: IpaRow | undefined): string =>
  !r ? '–' : r.status === 'current' ? 'Holding' : r.status === 'available' ? (r.count && r.count > 1 ? String(r.count) : '') : '✕'
