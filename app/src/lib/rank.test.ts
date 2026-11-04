import { describe, expect, it } from 'vitest'
import {
  commit, destFromGap, emptyHistory, exportText, initialLists, moveToSheet, moveWithin, redo, sortList, undo, validateExport,
} from './rank'

const L = [10, 20, 30, 40, 50, 60]

describe('moveWithin', () => {
  it('moves to start and end keeping the moved lines in their list order', () => {
    expect(moveWithin(L, [50, 20], { kind: 'start' })).toEqual([20, 50, 10, 30, 40, 60])
    expect(moveWithin(L, [20, 50], { kind: 'end' })).toEqual([10, 30, 40, 60, 20, 50])
  })
  it('moves above / below a target line', () => {
    expect(moveWithin(L, [60], { kind: 'above', target: 20 })).toEqual([10, 60, 20, 30, 40, 50])
    expect(moveWithin(L, [10, 20], { kind: 'below', target: 40 })).toEqual([30, 40, 10, 20, 50, 60])
  })
  it('ignores a target that is itself moved, unknown ids, and appends when the target is missing', () => {
    expect(moveWithin(L, [20, 30], { kind: 'above', target: 30 })).toBe(L)
    expect(moveWithin(L, [999], { kind: 'start' })).toBe(L)
    expect(moveWithin(L, [10], { kind: 'above', target: 999 })).toEqual([20, 30, 40, 50, 60, 10])
  })
})

describe('moveToSheet', () => {
  it('moves lines to another worksheet exactly once', () => {
    const l = moveToSheet(initialLists(L), 'bidding', [20, 40], 'excluded')
    expect(l.bidding).toEqual([10, 30, 50, 60])
    expect(l.excluded).toEqual([20, 40])
    const back = moveToSheet(l, 'excluded', [40], 'bidding', { kind: 'above', target: 30 })
    expect(back.bidding).toEqual([10, 40, 30, 50, 60])
    expect(back.excluded).toEqual([20])
  })
  it('within the same sheet behaves like moveWithin', () => {
    expect(moveToSheet(initialLists(L), 'bidding', [60], 'bidding', { kind: 'start' }).bidding[0]).toBe(60)
  })
})

describe('destFromGap (drag and drop over visible rows)', () => {
  const vis = [10, 20, 30, 40]
  it('maps a gap to above the next kept row, or below the last', () => {
    expect(destFromGap(vis, new Set([30]), 0)).toEqual({ kind: 'above', target: 10 })
    expect(destFromGap(vis, new Set([30]), 4)).toEqual({ kind: 'below', target: 40 })
    expect(destFromGap(vis, new Set([40]), 4)).toEqual({ kind: 'below', target: 30 })
  })
  it('skips moved rows when counting', () => {
    expect(destFromGap(vis, new Set([10, 20]), 3)).toEqual({ kind: 'above', target: 40 })
    expect(destFromGap(vis, new Set([10, 20, 30, 40]), 2)).toEqual({ kind: 'end' })
  })
})

describe('sorting, export and history', () => {
  it('sorts stably', () => {
    const key = (n: number) => (n === 20 || n === 40 ? 1 : 2)
    expect(sortList(L, key, 'asc')).toEqual([20, 40, 10, 30, 50, 60])
    expect(sortList(L, key, 'desc')).toEqual([10, 30, 50, 60, 20, 40])
  })
  it('exports space separated and validates', () => {
    expect(exportText([673, 522, 812, 547])).toBe('673 522 812 547')
    expect(validateExport([1, 2, 2, 9], new Set([1, 2])).problems).toEqual(['Line 2 appears more than once', 'Line 9 is not in this package'])
    expect(validateExport([], new Set()).ok).toBe(false)
    expect(validateExport([1, 2], new Set([1, 2])).ok).toBe(true)
  })
  it('undoes and redoes snapshots', () => {
    const a = initialLists(L)
    const b = moveToSheet(a, 'bidding', [10], 'excluded')
    let h = commit(emptyHistory(), a)
    const u = undo(h, b)!
    expect(u.lists).toBe(a)
    h = u.history
    const r = redo(h, a)!
    expect(r.lists).toBe(b)
    expect(undo(emptyHistory(), a)).toBeNull()
    expect(redo(emptyHistory(), a)).toBeNull()
  })
})

import { blockByPosition, lineAtPosition } from './rank'

describe('absolute positions', () => {
  const l = [10, 20, 30, 40, 50, 60]
  it('selects a block by 1-based position and validates the range', () => {
    expect(blockByPosition(l, 2, 4)).toEqual([20, 30, 40])
    expect(blockByPosition(l, 3, 3)).toEqual([30])
    expect(blockByPosition(l, 0, 3)).toBeNull()
    expect(blockByPosition(l, 4, 3)).toBeNull()
    expect(blockByPosition(l, 5, 7)).toBeNull()
    expect(blockByPosition(l, 1.5, 3)).toBeNull()
  })
  it('maps a position to its line', () => {
    expect(lineAtPosition(l, 1)).toBe(10)
    expect(lineAtPosition(l, 6)).toBe(60)
    expect(lineAtPosition(l, 7)).toBeUndefined()
    expect(lineAtPosition(l, 0)).toBeUndefined()
  })
  it('moving a block by position keeps its order', () => {
    const block = blockByPosition(l, 2, 3)!
    expect(moveWithin(l, block, { kind: 'end' })).toEqual([10, 40, 50, 60, 20, 30])
  })
})

import { blocksUnion, MAX_BLOCKS } from './rank'

describe('non-adjacent blocks', () => {
  const l = Array.from({ length: 20 }, (_, i) => (i + 1) * 10) // positions 1..20 = lines 10..200
  it('unions separate position blocks in worksheet order', () => {
    expect(blocksUnion(l, [{ from: 2, to: 3 }, { from: 10, to: 11 }])).toEqual([20, 30, 100, 110])
    expect(blocksUnion(l, [{ from: 10, to: 11 }, { from: 2, to: 3 }])).toEqual([20, 30, 100, 110])
  })
  it('overlapping blocks do not duplicate lines', () => {
    expect(blocksUnion(l, [{ from: 2, to: 5 }, { from: 4, to: 6 }])).toEqual([20, 30, 40, 50, 60])
  })
  it('rejects an invalid block, no blocks, or more than five', () => {
    expect(blocksUnion(l, [{ from: 2, to: 3 }, { from: 9, to: 99 }])).toBeNull()
    expect(blocksUnion(l, [])).toBeNull()
    expect(MAX_BLOCKS).toBe(5)
    expect(blocksUnion(l, Array.from({ length: 6 }, (_, i) => ({ from: i + 1, to: i + 1 })))).toBeNull()
    expect(blocksUnion(l, Array.from({ length: 5 }, (_, i) => ({ from: i + 1, to: i + 1 })))).toHaveLength(5)
  })
  it('moving two blocks keeps order and lands them together at the target', () => {
    const sel = blocksUnion(l, [{ from: 2, to: 3 }, { from: 10, to: 11 }])!
    const out = moveWithin(l, sel, { kind: 'below', target: 150 })
    expect(out.indexOf(20)).toBe(out.indexOf(150) + 1)
    expect(out.slice(out.indexOf(150) + 1, out.indexOf(150) + 5)).toEqual([20, 30, 100, 110])
    expect(out).toHaveLength(20)
  })
})
