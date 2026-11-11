import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiCall, apiText, normalizeUrl, planSync } from './sync'

const L = (key: string, savedAt: number) => ({ key, value: { v: key + savedAt }, savedAt })
const R = (key: string, clientUpdated: number) => ({ key, value: { v: key + clientUpdated }, clientUpdated })

describe('planSync', () => {
  it('pulls remote-only and newer remote documents, pushes local-only and newer local ones', () => {
    const plan = planSync(
      [L('a', 10), L('b', 50), L('c', 30), L('local-only', 5)],
      [R('a', 20), R('b', 40), R('c', 30), R('remote-only', 7)],
    )
    expect(plan.pull.map((d) => d.key).sort()).toEqual(['a', 'remote-only'])
    expect(plan.push.map((d) => d.key).sort()).toEqual(['b', 'local-only'])
    expect(plan.push.find((d) => d.key === 'b')!.clientUpdated).toBe(50)
  })
  it('does nothing when both sides match', () => {
    expect(planSync([L('a', 1)], [R('a', 1)])).toEqual({ pull: [], push: [] })
  })
})

describe('normalizeUrl', () => {
  it('trims and removes trailing slashes and rejects non-http addresses', () => {
    expect(normalizeUrl(' https://bidline.example.workers.dev/ ')).toBe('https://bidline.example.workers.dev')
    expect(() => normalizeUrl('bidline.example.workers.dev')).toThrow()
  })
})

describe('offline', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('makes no request at all while the device is offline', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('navigator', { onLine: false })
    await expect(apiCall('https://x.example', null, '/api/ipa')).rejects.toThrow(/offline/i)
    await expect(apiText('https://x.example', null, '/api/package/2701')).rejects.toThrow(/offline/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('still makes the request when online', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) })
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('navigator', { onLine: true })
    await expect(apiCall('https://x.example', null, '/api/ipa')).resolves.toEqual({ ok: 1 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
