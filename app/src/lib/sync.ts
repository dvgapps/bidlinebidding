/**
 * Optional sync of the small `kv` documents (rankings per bid+seat, desired dates, vacation) with the
 * Cloudflare Worker in `worker/`. The app is offline-first: everything is saved locally first and sync is best
 * effort. Conflict rule: per document, the newer `clientUpdated` timestamp wins. Bid packages are NOT synced.
 */
import { kvAll, kvSet } from './db'

const CONFIG_KEY = 'bidline-sync-v2'

export interface SyncConfig {
  /** base URL of the Worker, no trailing slash */
  url: string
  token: string
  /** token expiry (ms since epoch) */
  expires: number
}

export const getSyncConfig = (): SyncConfig | null => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as SyncConfig) : null
  } catch {
    return null
  }
}
export const saveSyncConfig = (c: SyncConfig | null): void => {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {
    /* storage unavailable */
  }
}

export class SyncError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

export const normalizeUrl = (u: string): string => {
  const t = u.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(t)) throw new SyncError('The server address must start with https://')
  return t
}

export async function apiCall<T>(url: string, token: string | null, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    })
  } catch {
    throw new SyncError('Cannot reach the server (offline, wrong address, or blocked by CORS).')
  }
  if (!res.ok) {
    let msg = `Server error ${res.status}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {
      /* not JSON */
    }
    throw new SyncError(msg, res.status)
  }
  return (await res.json()) as T
}

export async function signIn(urlInput: string, passphrase: string): Promise<SyncConfig> {
  const url = normalizeUrl(urlInput)
  const r = await apiCall<{ token: string; expires: number }>(url, null, '/api/login', {
    method: 'POST',
    body: JSON.stringify({ passphrase }),
  })
  const cfg = { url, token: r.token, expires: r.expires }
  saveSyncConfig(cfg)
  return cfg
}

export interface Doc {
  key: string
  value: unknown
  clientUpdated: number
}

export interface SyncPlan {
  pull: Doc[]
  push: Doc[]
}

/** Pure: decide what to pull and push (the newer timestamp wins; a tie does nothing). */
export function planSync(local: { key: string; value: unknown; savedAt: number }[], remote: Doc[]): SyncPlan {
  const plan: SyncPlan = { pull: [], push: [] }
  const loc = new Map(local.map((l) => [l.key, l]))
  const rem = new Map(remote.map((r) => [r.key, r]))
  for (const r of remote) {
    const l = loc.get(r.key)
    if (!l || r.clientUpdated > l.savedAt) plan.pull.push(r)
    else if (l.savedAt > r.clientUpdated) plan.push.push({ key: l.key, value: l.value, clientUpdated: l.savedAt })
  }
  for (const l of local) if (!rem.has(l.key)) plan.push.push({ key: l.key, value: l.value, clientUpdated: l.savedAt })
  return plan
}

export interface SyncResult {
  pulled: string[]
  pushed: number
}

export async function syncAll(cfg: SyncConfig): Promise<SyncResult> {
  const remote = await apiCall<Doc[]>(cfg.url, cfg.token, '/api/kv')
  const plan = planSync(await kvAll(), remote)
  for (const r of plan.pull) await kvSet(r.key, r.value, r.clientUpdated)
  for (const p of plan.push)
    await apiCall(cfg.url, cfg.token, `/api/kv/${encodeURIComponent(p.key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value: p.value, clientUpdated: p.clientUpdated }),
    })
  return { pulled: plan.pull.map((r) => r.key), pushed: plan.push.length }
}
