import type { IpaSnapshot } from './ipa'

const RE_UPDATED = /(\d\d)\/(\d\d)\/(\d\d)\s+at\s+(\d\d):(\d\d)z/i

/**
 * The IPA page stamps its update time in UTC ("11/04/26 at 19:35z"). Bids follow SDF (Louisville) time, so show it in
 * America/New_York with its zone name: "11/04/26 14:35 EST". Returns the text unchanged if it is not in that format.
 */
export function formatIpaUpdated(updated: string | null): string | null {
  if (!updated) return null
  const m = RE_UPDATED.exec(updated)
  if (!m) return updated
  const ms = Date.UTC(2000 + Number(m[3]), Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]))
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(ms)
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return `${p('month')}/${p('day')}/${p('year')} ${p('hour')}:${p('minute')} ${p('timeZoneName')}`
}

/** Lines on your bid that are still open to you (taken lines and the line you already hold are not counted). */
export const remainingCount = (s: IpaSnapshot | null): number => (s?.rows ?? []).filter((r) => r.status === 'available').length

/** "11/04/26 14:35 EST · 262 senior bids, 28 remaining · Holding 800" */
export function ipaSummary(s: IpaSnapshot): string {
  const when = formatIpaUpdated(s.updated)
  const bids = `${s.seniorBids ?? '?'} senior bids, ${remainingCount(s)} remaining`
  return [when ? `IPA ${when}` : 'IPA', bids, `Holding ${s.holding ?? '–'}`].join(' · ')
}
