/** Pure ranking operations. A worksheet is an ordered list of line numbers, most preferred first. */

export type Sheet = 'bidding' | 'work1' | 'work2' | 'excluded'
export const sheetLabel = (id: Sheet): string => SHEETS.find((s) => s.id === id)!.label

export const SHEETS: { id: Sheet; label: string }[] = [
  { id: 'bidding', label: 'Bidding' },
  { id: 'work1', label: 'Work 1' },
  { id: 'work2', label: 'Work 2' },
  { id: 'excluded', label: 'Excluded' },
]

export type Lists = Record<Sheet, number[]>

export type Dest =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'above'; target: number }
  | { kind: 'below'; target: number }

export const emptyLists = (): Lists => ({ bidding: [], work1: [], work2: [], excluded: [] })

export function initialLists(numbers: number[]): Lists {
  return { ...emptyLists(), bidding: [...numbers] }
}

/** The ids, in the order they currently have in `list` (so a multi-move keeps relative order). */
export const inListOrder = (list: number[], ids: Iterable<number>): number[] => {
  const want = new Set(ids)
  return list.filter((n) => want.has(n))
}

/** Insert `moved` into `rest` (which must not contain them) at the destination. */
function place(rest: number[], moved: number[], dest: Dest): number[] {
  switch (dest.kind) {
    case 'start':
      return [...moved, ...rest]
    case 'end':
      return [...rest, ...moved]
    case 'above':
    case 'below': {
      const i = rest.indexOf(dest.target)
      if (i < 0) return [...rest, ...moved]
      const at = dest.kind === 'above' ? i : i + 1
      return [...rest.slice(0, at), ...moved, ...rest.slice(at)]
    }
  }
}

/** Move lines within one list. Moving relative to a line that is itself being moved is a no-op. */
export function moveWithin(list: number[], ids: Iterable<number>, dest: Dest): number[] {
  const moved = inListOrder(list, ids)
  if (moved.length === 0) return list
  if ((dest.kind === 'above' || dest.kind === 'below') && moved.includes(dest.target)) return list
  const set = new Set(moved)
  return place(
    list.filter((n) => !set.has(n)),
    moved,
    dest,
  )
}

/** Move lines to another worksheet (default: end of it). A line lives on exactly one sheet. */
export function moveToSheet(lists: Lists, from: Sheet, ids: Iterable<number>, to: Sheet, dest: Dest = { kind: 'end' }): Lists {
  const moved = inListOrder(lists[from], ids)
  if (moved.length === 0) return lists
  if (from === to) return { ...lists, [from]: moveWithin(lists[from], moved, dest) }
  const set = new Set(moved)
  return {
    ...lists,
    [from]: lists[from].filter((n) => !set.has(n)),
    [to]: place(lists[to].filter((n) => !set.has(n)), moved, dest),
  }
}

/**
 * Drop destination for a drag whose pointer is over the gap `gap` (0..visible.length) of the
 * *visible* rows (filters may hide some list rows). Returns null when dropping onto the moved lines.
 */
export function destFromGap(visible: number[], moved: Set<number>, gap: number): Dest | null {
  const rest = visible.filter((n) => !moved.has(n))
  // number of non-moved rows above the gap
  const above = visible.slice(0, gap).filter((n) => !moved.has(n)).length
  if (rest.length === 0) return { kind: 'end' }
  if (above >= rest.length) return { kind: 'below', target: rest[rest.length - 1] }
  return { kind: 'above', target: rest[above] }
}

/** Stable sort of a list by a numeric key; ties keep their existing order. */
export function sortList(list: number[], key: (n: number) => number, dir: 'asc' | 'desc'): number[] {
  const sign = dir === 'asc' ? 1 : -1
  return list
    .map((n, i) => ({ n, i, k: key(n) }))
    .sort((a, b) => sign * (a.k - b.k) || a.i - b.i)
    .map((x) => x.n)
}

export interface ValidationResult {
  ok: boolean
  problems: string[]
}

/** Export validation: no duplicates, every number exists in the package. */
export function validateExport(list: number[], valid: Set<number>): ValidationResult {
  const problems: string[] = []
  const seen = new Set<number>()
  for (const n of list) {
    if (seen.has(n)) problems.push(`Line ${n} appears more than once`)
    seen.add(n)
    if (!valid.has(n)) problems.push(`Line ${n} is not in this package`)
  }
  if (list.length === 0) problems.push('The Bidding list is empty')
  return { ok: problems.length === 0, problems }
}

/** BRIEFING 8.4: numbers separated by single spaces, most preferred first. */
export const exportText = (list: number[]): string => list.join(' ')

/** Undo / redo history of Lists snapshots. */
export interface History {
  past: Lists[]
  future: Lists[]
}
export const emptyHistory = (): History => ({ past: [], future: [] })
const MAX_HISTORY = 100

export function commit(h: History, before: Lists): History {
  return { past: [...h.past, before].slice(-MAX_HISTORY), future: [] }
}
export function undo(h: History, current: Lists): { history: History; lists: Lists } | null {
  const prev = h.past[h.past.length - 1]
  if (!prev) return null
  return { lists: prev, history: { past: h.past.slice(0, -1), future: [current, ...h.future] } }
}
export function redo(h: History, current: Lists): { history: History; lists: Lists } | null {
  const next = h.future[0]
  if (!next) return null
  return { lists: next, history: { past: [...h.past, current], future: h.future.slice(1) } }
}

/** Lines at absolute (1-based) positions `from..to` of a worksheet, or null when the range is invalid. */
export function blockByPosition(list: number[], from: number, to: number): number[] | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > list.length) return null
  return list.slice(from - 1, to)
}

/** Line number at absolute (1-based) position, or undefined. */
export const lineAtPosition = (list: number[], pos: number): number | undefined =>
  Number.isInteger(pos) && pos >= 1 ? list[pos - 1] : undefined

/** The contract-style limit on separate position blocks in one move. */
export const MAX_BLOCKS = 6

/** Union of several position blocks (e.g. 21-44 and 93-114), in worksheet order; null if any block is invalid. */
export function blocksUnion(list: number[], blocks: { from: number; to: number }[]): number[] | null {
  if (blocks.length === 0 || blocks.length > MAX_BLOCKS) return null
  const picked = new Set<number>()
  for (const b of blocks) {
    const s = blockByPosition(list, b.from, b.to)
    if (!s) return null
    s.forEach((n) => picked.add(n))
  }
  return inListOrder(list, picked)
}
