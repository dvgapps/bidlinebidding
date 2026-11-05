import Dexie, { type EntityTable } from 'dexie'
import type { Bundle } from '../types'

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

export async function loadLatestPackage(): Promise<Bundle | null> {
  const rows = await db.packages.orderBy('savedAt').reverse().limit(1).toArray()
  return rows[0]?.bundle ?? null
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    return ((await db.kv.get(key))?.value as T) ?? null
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

/** Every stored document with its timestamp (used by sync). */
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
  const rows = (await db.packages.toArray()).filter((p) => p.id < bidId).sort((a, b) => (a.id < b.id ? 1 : -1))
  return rows[0]?.bundle ?? null
}
