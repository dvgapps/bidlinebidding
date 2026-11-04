import { apiText, apiCall, type SyncConfig } from './sync'

/** What the Worker knows about a package uploaded from the PC (`python -m ingest ... --publish`). */
export interface PackageMeta {
  id: string
  generated: string
  uploadedAt: number
  bytes: number
  lines: number
  trips: number
}

export const listServerPackages = (cfg: SyncConfig): Promise<PackageMeta[]> => apiCall<PackageMeta[]>(cfg.url, cfg.token, '/api/packages')

/** The package JSON text exactly as stored (parsed and validated by the importer). */
export const downloadServerPackage = (cfg: SyncConfig, id: string): Promise<string> =>
  apiText(cfg.url, cfg.token, `/api/package/${encodeURIComponent(id)}`)

/**
 * The server package worth offering: a later bid period than the one loaded, or the same bid period regenerated
 * (different "generated" stamp, uploaded after the loaded copy was made). Null when nothing newer is waiting.
 */
export function pickNewer(
  list: PackageMeta[],
  loaded: { id: string; generated: string } | null,
): PackageMeta | null {
  const sorted = [...list].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : b.uploadedAt - a.uploadedAt))
  const top = sorted[0]
  if (!top) return null
  if (!loaded) return top
  if (top.id > loaded.id) return top
  const same = sorted.find((p) => p.id === loaded.id)
  if (same && same.generated !== loaded.generated) return same
  return null
}
