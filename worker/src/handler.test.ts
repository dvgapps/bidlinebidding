import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { handle, makeToken, verifyToken, type Env, type KVLike } from './handler'

class MemKV implements KVLike {
  m = new Map<string, string>()
  async get(k: string) {
    return this.m.get(k) ?? null
  }
  async put(k: string, v: string) {
    this.m.set(k, v)
  }
  async list(o: { prefix: string }) {
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(o.prefix)).map((name) => ({ name })), list_complete: true }
  }
}

const ORIGIN = 'https://pilot.github.io'
let env: Env
const call = (path: string, init: RequestInit = {}, origin: string | null = ORIGIN) =>
  handle(
    new Request('https://api.example.workers.dev' + path, {
      ...init,
      headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': '1.2.3.4', ...(init.headers ?? {}) },
    }),
    env,
  )
const login = async (passphrase = 'correct horse battery staple') =>
  call('/api/login', { method: 'POST', body: JSON.stringify({ passphrase }) })
const authed = async () => {
  const r = await (await login()).json() as any
  return { Authorization: `Bearer ${r.token}`, 'content-type': 'application/json' }
}

beforeEach(() => {
  env = { KV: new MemKV(), PASSPHRASE: 'correct horse battery staple', TOKEN_SECRET: 'test-secret-0123456789', ALLOWED_ORIGIN: ORIGIN }
})

describe('login and tokens', () => {
  it('signs in with the right passphrase and rejects a wrong one', async () => {
    const ok = await login()
    expect(ok.status).toBe(200)
    expect((await ok.json() as any).token).toContain('.')
    expect((await login('nope')).status).toBe(401)
  })

  it('locks out after repeated failures, even for the right passphrase', async () => {
    for (let i = 0; i < 10; i++) await login('bad')
    expect((await login()).status).toBe(429)
  })

  it('tokens verify, expire, and cannot be forged', async () => {
    const { token } = await makeToken('s3cret', 1_000)
    expect(await verifyToken('s3cret', token, 2_000)).toBe(true)
    expect(await verifyToken('other', token, 2_000)).toBe(false)
    expect(await verifyToken('s3cret', token, 1_000 + 31 * 86400_000)).toBe(false)
    const [p] = token.split('.')
    expect(await verifyToken('s3cret', `${p}.AAAA`, 2_000)).toBe(false)
    expect(await verifyToken('s3cret', 'garbage', 2_000)).toBe(false)
  })

  it('requires a token for data routes', async () => {
    expect((await call('/api/kv')).status).toBe(401)
    expect((await call('/api/kv/work:2701:captain', { method: 'PUT', body: '{}' })).status).toBe(401)
    expect((await call('/api/health')).status).toBe(200)
  })
})

describe('kv storage', () => {
  it('stores, lists, and keeps the newer copy (last write wins)', async () => {
    const h = await authed()
    const put = (v: unknown, t: number) =>
      call('/api/kv/work:2701:captain', { method: 'PUT', headers: h, body: JSON.stringify({ value: v, clientUpdated: t }) })
    expect((await (await put({ bidding: [1, 2] }, 100)).json() as any).stored).toBe(true)
    expect((await (await put({ bidding: [9] }, 50)).json() as any).stored).toBe(false) // older
    expect((await (await put({ bidding: [9] }, 100)).json() as any).stored).toBe(false) // same time
    expect((await (await put({ bidding: [3, 4] }, 200)).json() as any).stored).toBe(true)
    const list = await (await call('/api/kv', { headers: h })).json() as any
    expect(list).toEqual([{ key: 'work:2701:captain', value: { bidding: [3, 4] }, clientUpdated: 200 }])
  })

  it('validates keys and bodies', async () => {
    const h = await authed()
    const put = (key: string, body: unknown) => call(`/api/kv/${encodeURIComponent(key)}`, { method: 'PUT', headers: h, body: JSON.stringify(body) })
    expect((await put('bad key!', { value: 1, clientUpdated: 1 })).status).toBe(400)
    expect((await put('ok', { value: 1 })).status).toBe(400)
    expect((await put('ok', { clientUpdated: 1 })).status).toBe(400)
    expect((await call('/api/kv/ok', { method: 'PUT', headers: h, body: 'not json' })).status).toBe(400)
    expect((await call('/api/nothing', { headers: h })).status).toBe(404)
  })
})

describe('CORS', () => {
  it('answers preflight for the allowed origin only', async () => {
    const ok = await call('/api/kv', { method: 'OPTIONS' })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    const bad = await call('/api/kv', { method: 'OPTIONS' }, 'https://evil.example.com')
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
  it('refuses browser requests from other origins, allows non-browser clients with a token', async () => {
    expect((await call('/api/health', {}, 'https://evil.example.com')).status).toBe(403)
    expect((await call('/api/health', {}, null)).status).toBe(200)
  })
})

describe('GET /api/ipa', () => {
  const html = readFileSync('test/fixtures/ipa-mobile.html', 'utf8') // tests run from worker/
  const ipaCall = (fetchFn: typeof fetch, now: number, headers: Record<string, string>) =>
    handle(new Request('https://api.example.workers.dev/api/ipa', { headers: { Origin: ORIGIN, ...headers } }), env, now, fetchFn)
  const okFetch = (calls: string[]): typeof fetch =>
    (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(html, { status: 200 })
    }) as typeof fetch

  it('needs the employee id configured and a signed-in user', async () => {
    const h = await authed()
    expect((await ipaCall(okFetch([]), 1, h)).status).toBe(503)
    env.IPA_EMPLOYEE_ID = '1234567'
    expect((await ipaCall(okFetch([]), 1, {})).status).toBe(401)
  })

  it('fetches, parses, caches, and never fetches more often than every 3 minutes', async () => {
    env.IPA_EMPLOYEE_ID = '1234567'
    const h = await authed()
    const calls: string[] = []
    const f = okFetch(calls)
    const t0 = Date.now()
    const first = await (await ipaCall(f, t0, h)).json() as any
    expect(first.cached).toBe(false)
    expect(first.snapshot.holding).toBe(813)
    expect(first.snapshot.rows).toHaveLength(12)
    expect(calls).toEqual(['https://ipasnapshot.appspot.com/m?gems=1234567'])
    const second = await (await ipaCall(f, t0 + 60_000, h)).json() as any
    expect(second.cached).toBe(true)
    expect(calls).toHaveLength(1)
    const third = await (await ipaCall(f, t0 + 181_000, h)).json() as any
    expect(third.cached).toBe(false)
    expect(calls).toHaveLength(2)
    expect(JSON.stringify([first, second, third])).not.toContain('1234567') // the id never reaches the browser
  })

  it('falls back to the last copy when the site is down, and errors when there is none', async () => {
    env.IPA_EMPLOYEE_ID = '1234567'
    const h = await authed()
    const down = (async () => new Response('x', { status: 500 })) as typeof fetch
    expect((await ipaCall(down, Date.now(), h)).status).toBe(502)
    const t0 = Date.now()
    await ipaCall(okFetch([]), t0, h)
    const stale = await (await ipaCall(down, t0 + 400_000, h)).json() as any
    expect(stale.stale).toBe(true)
    expect(stale.snapshot.rows).toHaveLength(12)
  })

  it('keeps the earlier copy when the page says no bid on file, and reports a changed layout as an error', async () => {
    env.IPA_EMPLOYEE_ID = '1234567'
    const h = await authed()
    const t0 = Date.now()
    await ipaCall(okFetch([]), t0, h)
    const noBid = (async () => new Response('<html>No bid on file</html>', { status: 200 })) as typeof fetch
    const r = await (await ipaCall(noBid, t0 + 400_000, h)).json() as any
    expect(r.warning).toMatch(/No bid/)
    expect(r.snapshot.rows).toHaveLength(12)
    const changed = (async () => new Response('<html><h1>Maintenance</h1></html>', { status: 200 })) as typeof fetch
    const bad = await ipaCall(changed, t0 + 800_000, h)
    expect(bad.status).toBe(502)
    expect(((await bad.json()) as any).error).toMatch(/format changed/)
  })
})

describe('package storage', () => {
  const pkg = (id = '2701', extra: object = {}) =>
    JSON.stringify({ schema: 1, bidPeriod: { id, generated: '29Oct2026 14:13' }, lines: [{ number: 500 }, { number: 501 }], trips: [{ id: '5009' }], ...extra })
  const put = (path: string, body: string, h: Record<string, string>) => call(path, { method: 'PUT', headers: h, body })

  it('stores a valid package, lists it, and returns it unchanged', async () => {
    const h = await authed()
    const r = (await (await put('/api/package/2701', pkg(), h)).json()) as any
    expect(r).toMatchObject({ stored: true, id: '2701', generated: '29Oct2026 14:13', lines: 2, trips: 1 })
    const list = (await (await call('/api/packages', { headers: h })).json()) as any[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: '2701', lines: 2, trips: 1 })
    const got = await call('/api/package/2701', { headers: h })
    expect(got.status).toBe(200)
    expect(await got.text()).toBe(pkg())
  })

  it('replaces an older upload for the same bid and keeps other bids', async () => {
    const h = await authed()
    await put('/api/package/2701', pkg('2701'), h)
    await put('/api/package/2702', pkg('2702'), h)
    await put('/api/package/2701', pkg('2701', { lines: [{ number: 1 }] }), h)
    const list = (await (await call('/api/packages', { headers: h })).json()) as any[]
    expect(list.map((m) => m.id).sort()).toEqual(['2701', '2702'])
    expect(list.find((m) => m.id === '2701').lines).toBe(1)
  })

  it('rejects bad input', async () => {
    const h = await authed()
    expect((await put('/api/package/2701', 'not json', h)).status).toBe(400)
    expect((await put('/api/package/2701', JSON.stringify({ schema: 2 }), h)).status).toBe(400)
    expect((await put('/api/package/2701', pkg('2702'), h)).status).toBe(400) // id does not match the path
    expect((await put('/api/package/27x1', pkg(), h)).status).toBe(400)
    expect((await call('/api/package/2799', { headers: h })).status).toBe(404)
    expect((await put('/api/package/2701', 'x'.repeat(20_000_001), h)).status).toBe(413)
  })

  it('needs a signed-in user', async () => {
    expect((await call('/api/packages')).status).toBe(401)
    expect((await call('/api/package/2701', { method: 'PUT', body: pkg() })).status).toBe(401)
    expect((await call('/api/package/2701')).status).toBe(401)
  })
})
