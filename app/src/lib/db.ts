import Dexie, { type EntityTable } from 'dexie'
import type { Bundle, LineType } from '../types'

interface StoredPackage {
  id: string // bid period id, e.g. "2701"
  savedAt: number
  bundle: Bundle
}

/** Small key/value documents: rankings per bid+seat, desired dates off per bid. */
interface KV {
  key: string
  value: unknown
  savedAt: number
  /** a delete marker: the document was removed (kept so the delete reaches the server and the other devices) */
  deleted?: boolean
}

const db = new Dexie('bidline-bidding') as Dexie & {
  packages: EntityTable<StoredPackage, 'id'>
  kv: EntityTable<KV, 'key'>
}
db.version(1).stores({ packages: 'id, savedAt' })
db.version(2).stores({ packages: 'id, savedAt', kv: 'key' })

export async function savePackage(bundle: Bundle): Promise<void> {
  await db.packages.put({ id: bundle.bidPeriod.id, savedAt: Date.now(), bundle })
}

/** What the Preferences list shows about a stored package (without keeping its 5 MB in memory). */
export interface StoredInfo {
  id: string
  savedAt: number
  generated: string
  lines: number
  trips: number
  /** line number to line type, to check an awarded line and show what it is */
  lineTypes: Record<number, LineType>
}

export async function listStoredPackages(): Promise<StoredInfo[]> {
  const out: StoredInfo[] = []
  try {
    await db.packages.each((p) => {
      out.push({
        id: p.id,
        savedAt: p.savedAt,
        generated: p.bundle.bidPeriod.generated,
        lines: p.bundle.lines.length,
        trips: p.bundle.trips.length,
        lineTypes: Object.fromEntries(p.bundle.lines.map((l) => [l.number, l.type])),
      })
    })
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1))
}

export async function loadPackage(id: string): Promise<Bundle | null> {
  return (await db.packages.get(id))?.bundle ?? null
}

export async function deleteStoredPackage(id: string): Promise<void> {
  await db.packages.delete(id)
}

export async function loadLatestPackage(): Promise<Bundle | null> {
  const rows = await db.packages.orderBy('savedAt').reverse().limit(1).toArray()
  return rows[0]?.bundle ?? null
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const row = await db.kv.get(key)
    return row && !row.deleted ? ((row.value as T) ?? null) : null
  } catch {
    return null
  }
}

export async function kvSet(key: string, value: unknown, savedAt = Date.now()): Promise<void> {
  try {
    await db.kv.put({ key, value, savedAt })
  } catch {
    /* storage may be unavailable (private mode); the app keeps working in memory */
  }
}

/** Remove a document, leaving a delete marker for sync (a later write of the same key replaces the marker). */
export async function kvDelete(key: string, savedAt = Date.now()): Promise<void> {
  try {
    await db.kv.put({ key, value: null, savedAt, deleted: true })
  } catch {
    /* storage may be unavailable */
  }
}

/** Every stored document with its timestamp, delete markers included (used by sync). */
export async function kvAll(): Promise<KV[]> {
  try {
    return await db.kv.toArray()
  } catch {
    return []
  }
}

/** Ask the browser not to evict our data (Safari may otherwise clear it). Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export function validateBundle(x: unknown): Bundle {
  const b = x as Partial<Bundle>
  if (!b || typeof b !== 'object' || b.schema !== 1 || !Array.isArray(b.lines) || !Array.isArray(b.trips) || !b.bidPeriod) {
    throw new Error('Not a BidlineBidding package (expected schema 1 JSON from the ingest tool).')
  }
  return b as Bundle
}

/** The newest stored package for an earlier bid period than `bidId` (ids sort chronologically, e.g. 2613 < 2701). */
export async function loadPackageBefore(bidId: string): Promise<Bundle | null> {
  const id = (await db.packages.toCollection().primaryKeys()).filter((k) => k < bidId).sort().reverse()[0]
  return id ? loadPackage(id) : null
}
