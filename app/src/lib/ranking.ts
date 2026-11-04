import type { Lists } from './rank'

export type UnlistedMode = 'end' | 'excluded'

export interface RankingImport {
  /** the new lists, or null when nothing in the text matched a line */
  lists: Lists | null
  /** distinct numbers found in the text, in order */
  found: number[]
  /** found and placed on the Bidding worksheet */
  matched: number[]
  /** found but not in this package (typo, or another bid period) */
  unknown: number[]
  /** in the package but not available to your seat */
  ineligible: number[]
  /** numbers that appeared more than once (only the first counts) */
  duplicates: number[]
  /** lines that were on Bidding but not in the pasted list */
  unlisted: number[]
}

/** Numbers separated by spaces, commas or new lines; anything that is not a whole number is ignored. */
export function parseNumberList(text: string): { numbers: number[]; duplicates: number[] } {
  const seen = new Set<number>()
  const duplicates = new Set<number>()
  const numbers: number[] = []
  for (const tok of text.split(/[\s,;]+/)) {
    if (!/^\d{1,5}$/.test(tok)) continue
    const n = Number(tok)
    if (seen.has(n)) duplicates.add(n)
    else {
      seen.add(n)
      numbers.push(n)
    }
  }
  return { numbers, duplicates: [...duplicates] }
}

/**
 * Apply a pasted ranking (e.g. from BidPro) to the worksheets: the listed lines become the Bidding worksheet in that order.
 * Lines that were on Bidding but are not listed go to the end of Bidding or to Excluded; other worksheets keep their unlisted lines.
 */
export function importRanking(
  text: string,
  lists: Lists,
  eligible: Set<number>,
  packageLines: Set<number>,
  mode: UnlistedMode,
): RankingImport {
  const { numbers, duplicates } = parseNumberList(text)
  const unknown = numbers.filter((n) => !packageLines.has(n))
  const ineligible = numbers.filter((n) => packageLines.has(n) && !eligible.has(n))
  const matched = numbers.filter((n) => eligible.has(n))
  if (matched.length === 0) return { lists: null, found: numbers, matched, unknown, ineligible, duplicates, unlisted: [] }
  const placed = new Set(matched)
  const unlisted = lists.bidding.filter((n) => !placed.has(n))
  const next: Lists = {
    bidding: mode === 'end' ? [...matched, ...unlisted] : [...matched],
    work1: lists.work1.filter((n) => !placed.has(n)),
    work2: lists.work2.filter((n) => !placed.has(n)),
    excluded:
      mode === 'excluded'
        ? [...lists.excluded.filter((n) => !placed.has(n)), ...unlisted]
        : lists.excluded.filter((n) => !placed.has(n)),
  }
  return { lists: next, found: numbers, matched, unknown, ineligible, duplicates, unlisted }
}
