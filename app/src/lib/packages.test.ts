import { describe, expect, it } from 'vitest'
import { pickNewer, type PackageMeta } from './packages'

const P = (id: string, generated: string, uploadedAt = 1): PackageMeta => ({ id, generated, uploadedAt, bytes: 1, lines: 332, trips: 1076 })

describe('pickNewer', () => {
  const loaded = { id: '2701', generated: '29Oct2026 14:13' }
  it('offers nothing when the loaded package is the newest and unchanged', () => {
    expect(pickNewer([P('2701', '29Oct2026 14:13')], loaded)).toBeNull()
    expect(pickNewer([], loaded)).toBeNull()
  })
  it('offers a later bid period', () => {
    expect(pickNewer([P('2701', '29Oct2026 14:13'), P('2702', '24Dec2026 16:02')], loaded)?.id).toBe('2702')
  })
  it('offers a regenerated copy of the same bid period', () => {
    expect(pickNewer([P('2701', '02Nov2026 09:00')], loaded)?.generated).toBe('02Nov2026 09:00')
  })
  it('offers the newest package when nothing is loaded', () => {
    expect(pickNewer([P('2613', 'a'), P('2701', 'b')], null)?.id).toBe('2701')
  })
})
