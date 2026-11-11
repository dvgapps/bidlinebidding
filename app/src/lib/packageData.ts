import type { Seat } from '../types'

/**
 * The saved documents (key/value, synced with the server) that belong to one bid package. Deleting a package removes all of
 * them, so a sort order, its desired dates, carry-in and award never outlive the package they were made for.
 */
export const workKey = (bid: string, seat: Seat): string => `work:${bid}:${seat}`
export const datesKey = (bid: string): string => `dates:${bid}`
export const carryKey = (bid: string): string => `carry:${bid}`
/** The line you were awarded in that bid period. */
export const awardKey = (bid: string): string => `award:${bid}`

export const packageKeys = (bid: string): string[] => [workKey(bid, 'captain'), workKey(bid, 'firstOfficer'), datesKey(bid), carryKey(bid), awardKey(bid)]

/** Bid period ids sort chronologically (2613 < 2701); the id of the next stored period after `bid`, if any. */
export const nextBidId = (ids: string[], bid: string): string | null => [...ids].filter((i) => i > bid).sort()[0] ?? null
