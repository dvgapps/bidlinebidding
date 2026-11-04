/**
 * Bidline Bidding API (Cloudflare Worker). Single user:
 *   POST /api/login          {passphrase}                  -> {token, expires}
 *   GET  /api/kv             (Bearer token)                -> [{key, value, clientUpdated}]
 *   PUT  /api/kv/<key>       {value, clientUpdated}        -> stores it unless the stored copy is newer
 *   GET  /api/health
 * Everything except health and login needs the token. CORS allows only ALLOWED_ORIGIN.
 */

import { IpaFormatError, IpaNoDataError, parseIpaMobile, type IpaSnapshot } from './ipa'

export interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
  list(opts: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>
}

export interface Env {
  KV: KVLike
  /** the sign-in passphrase (a Worker secret) */
  PASSPHRASE: string
  /** random secret used to sign tokens (a Worker secret) */
  TOKEN_SECRET: string
  /** allowed browser origins, comma separated */
  ALLOWED_ORIGIN: string
  /** your UPS employee id for the IPA Snapshot page (a Worker secret, never sent to the browser) */
  IPA_EMPLOYEE_ID?: string
  /** development only: serve the IPA page from somewhere else (never set in production) */
  IPA_BASE_URL?: string
}

const TOKEN_DAYS = 30
const MAX_BODY = 1_000_000
const KEY_RE = /^[A-Za-z0-9_.:-]{1,200}$/
/** Be polite to the IPA site: never fetch it more often than this, whatever the app asks. */
export const IPA_MIN_INTERVAL_MS = 3 * 60_000
const MAX_FAILS = 10
const FAIL_WINDOW_S = 15 * 60

const enc = new TextEncoder()
const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string): Uint8Array => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0))
}

const hmacKey = (secret: string, usage: ('sign' | 'verify')[]) =>
  crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage)

/** Constant-time string comparison (both sides are HMAC'd first so lengths do not leak). */
async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const k = await hmacKey(secret, ['sign'])
  const [x, y] = await Promise.all([crypto.subtle.sign('HMAC', k, enc.encode(a)), crypto.subtle.sign('HMAC', k, enc.encode(b))])
  const xa = new Uint8Array(x)
  const ya = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i]
  return diff === 0
}

export async function makeToken(secret: string, nowMs = Date.now()): Promise<{ token: string; expires: number }> {
  const expires = nowMs + TOKEN_DAYS * 86400_000
  const payload = b64url(enc.encode(JSON.stringify({ exp: expires })))
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, ['sign']), enc.encode(payload))
  return { token: `${payload}.${b64url(sig)}`, expires }
}

export async function verifyToken(secret: string, token: string, nowMs = Date.now()): Promise<boolean> {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return false
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, ['verify']), unb64url(sig), enc.encode(payload))
    if (!ok) return false
    const { exp } = JSON.parse(new TextDecoder().decode(unb64url(payload))) as { exp: number }
    return typeof exp === 'number' && exp > nowMs
  } catch {
    return false
  }
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin')
  const allowed = env.ALLOWED_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  const h: Record<string, string> = { Vary: 'Origin' }
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'GET, PUT, POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'authorization, content-type'
    h['Access-Control-Max-Age'] = '86400'
  }
  return h
}

const json = (data: unknown, status: number, extra: Record<string, string>): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  })

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.length > MAX_BODY) throw new HttpError(413, 'Body too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function handle(
  req: Request,
  env: Env,
  nowMs = Date.now(),
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<Response> {
  const cors = corsHeaders(req, env)
  const origin = req.headers.get('Origin')
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  // a browser request from an origin we do not know is refused outright
  if (origin && !cors['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, cors)

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') return json({ ok: true }, 200, cors)

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
      const failKey = `fail:${ip}`
      const fails = Number((await env.KV.get(failKey)) ?? 0)
      if (fails >= MAX_FAILS) return json({ error: 'Too many failed attempts. Try again in 15 minutes.' }, 429, cors)
      const body = (await readJson(req)) as { passphrase?: unknown }
      const given = typeof body.passphrase === 'string' ? body.passphrase : ''
      if (!env.PASSPHRASE || !(await safeEqual(given, env.PASSPHRASE, env.TOKEN_SECRET))) {
        await env.KV.put(failKey, String(fails + 1), { expirationTtl: FAIL_WINDOW_S })
        return json({ error: 'Wrong passphrase' }, 401, cors)
      }
      return json(await makeToken(env.TOKEN_SECRET, nowMs), 200, cors)
    }

    if (url.pathname.startsWith('/api/')) {
      const auth = req.headers.get('Authorization') ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
      if (!(await verifyToken(env.TOKEN_SECRET, token, nowMs))) return json({ error: 'Not signed in' }, 401, cors)
    }

    if (url.pathname === '/api/ipa' && req.method === 'GET') {
      const id = env.IPA_EMPLOYEE_ID ?? ''
      if (!/^[0-9]{4,10}$/.test(id)) throw new HttpError(503, 'The IPA Snapshot is not configured on the server.')
      const raw = await env.KV.get('ipa:cache')
      const cached = raw ? (JSON.parse(raw) as { fetchedAt: number; snapshot: IpaSnapshot }) : null
      if (cached && nowMs - cached.fetchedAt < IPA_MIN_INTERVAL_MS) {
        return json({ fetchedAt: cached.fetchedAt, cached: true, snapshot: cached.snapshot }, 200, cors)
      }
      let html: string
      try {
        const r = await fetchFn(`${env.IPA_BASE_URL ?? 'https://ipasnapshot.appspot.com'}/m?gems=${id}`, {
          headers: { 'user-agent': 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) BidlineBidding/1.0' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!r.ok) throw new Error(`status ${r.status}`)
        html = await r.text()
      } catch {
        if (cached) return json({ fetchedAt: cached.fetchedAt, cached: true, stale: true, warning: 'The IPA Snapshot site did not answer; showing the last copy.', snapshot: cached.snapshot }, 200, cors)
        throw new HttpError(502, 'The IPA Snapshot site did not answer.')
      }
      try {
        const snapshot = parseIpaMobile(html)
        await env.KV.put('ipa:cache', JSON.stringify({ fetchedAt: nowMs, snapshot }))
        return json({ fetchedAt: nowMs, cached: false, snapshot }, 200, cors)
      } catch (e) {
        if (e instanceof IpaNoDataError) {
          // transient: keep any earlier good copy, but say there is no new data
          return json({ fetchedAt: cached?.fetchedAt ?? null, cached: true, stale: true, warning: 'No bid on file on the IPA Snapshot yet.', snapshot: cached?.snapshot ?? null }, 200, cors)
        }
        if (e instanceof IpaFormatError) throw new HttpError(502, e.message)
        throw e
      }
    }

    if (url.pathname === '/api/kv' && req.method === 'GET') {
      const items: { key: string; value: unknown; clientUpdated: number }[] = []
      let cursor: string | undefined
      do {
        const page = await env.KV.list({ prefix: 'kv:', cursor })
        for (const k of page.keys) {
          const raw = await env.KV.get(k.name)
          if (!raw) continue
          const doc = JSON.parse(raw) as { value: unknown; clientUpdated: number }
          items.push({ key: k.name.slice(3), value: doc.value, clientUpdated: doc.clientUpdated })
        }
        cursor = page.list_complete ? undefined : page.cursor
      } while (cursor)
      return json(items, 200, cors)
    }

    const m = url.pathname.match(/^\/api\/kv\/(.+)$/)
    if (m && req.method === 'PUT') {
      const key = decodeURIComponent(m[1])
      if (!KEY_RE.test(key)) throw new HttpError(400, 'Invalid key')
      const body = (await readJson(req)) as { value?: unknown; clientUpdated?: unknown }
      if (typeof body.clientUpdated !== 'number' || !Number.isFinite(body.clientUpdated) || body.value === undefined) {
        throw new HttpError(400, 'Expected {value, clientUpdated}')
      }
      const existingRaw = await env.KV.get(`kv:${key}`)
      if (existingRaw) {
        const existing = JSON.parse(existingRaw) as { clientUpdated: number }
        if (existing.clientUpdated >= body.clientUpdated) return json({ stored: false, clientUpdated: existing.clientUpdated }, 200, cors)
      }
      await env.KV.put(`kv:${key}`, JSON.stringify({ value: body.value, clientUpdated: body.clientUpdated }))
      return json({ stored: true, clientUpdated: body.clientUpdated }, 200, cors)
    }

    return json({ error: 'Not found' }, 404, cors)
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, cors)
    return json({ error: 'Server error' }, 500, cors)
  }
}
