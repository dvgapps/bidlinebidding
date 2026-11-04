import { describe, expect, it } from 'vitest'
import { importRanking, parseNumberList } from './ranking'

describe('importing a pasted ranking', () => {
  const lists = { bidding: [500, 501, 502, 503, 504], work1: [505], work2: [], excluded: [506] }
  const all = new Set([500, 501, 502, 503, 504, 505, 506, 507])
  const eligible = new Set([500, 501, 502, 503, 504, 505, 506])

  it('parses spaces, commas and lines, ignoring words, and reports repeats', () => {
    expect(parseNumberList('503 501, 503\n500 SDFZ x12 99999999')).toEqual({ numbers: [503, 501, 500], duplicates: [503] })
  })

  it('puts the listed lines on Bidding in that order and the rest at the end', () => {
    const r = importRanking('503 500 505', lists, eligible, all, 'end')
    expect(r.lists!.bidding).toEqual([503, 500, 505, 501, 502, 504])
    expect(r.lists!.work1).toEqual([]) // 505 moved up from Work 1
    expect(r.unlisted).toEqual([501, 502, 504])
    expect(r.matched).toEqual([503, 500, 505])
  })

  it('can send the unlisted lines to Excluded instead', () => {
    const r = importRanking('503 500', lists, eligible, all, 'excluded')
    expect(r.lists!.bidding).toEqual([503, 500])
    expect(r.lists!.excluded).toEqual([506, 501, 502, 504])
    expect(r.lists!.work1).toEqual([505]) // other worksheets keep their unlisted lines
  })

  it('reports numbers that are not in the package or not for your seat, and does nothing without a match', () => {
    const r = importRanking('500 999 507', lists, eligible, all, 'end')
    expect(r.unknown).toEqual([999])
    expect(r.ineligible).toEqual([507])
    expect(r.matched).toEqual([500])
    expect(importRanking('999 888', lists, eligible, all, 'end').lists).toBeNull()
  })

  it('every line is on exactly one worksheet afterwards', () => {
    const r = importRanking('504 502 506 500', lists, eligible, all, 'excluded')
    const flat = [...r.lists!.bidding, ...r.lists!.work1, ...r.lists!.work2, ...r.lists!.excluded]
    expect(flat.sort()).toEqual([500, 501, 502, 503, 504, 505, 506])
  })
})
