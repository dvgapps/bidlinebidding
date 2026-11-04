import type { Line, Trip } from '../types'

/** Calendar days in the app are domicile-local (America/New_York); see BRIEFING 8.1. */
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
export const nyDate = (ms: number): string => NY.format(ms)

const hhmm = (s: string): number => {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

/** UTC instant (ms) of a trip's first report, given the domicile-local date it starts on (null if inconsistent). */
export function reportInstantMs(trip: Pick<Trip, 'reportUtc'>, startDate: string): number | null {
  const base = Date.parse(startDate + 'T00:00:00Z')
  for (const d of [0, -1, 1]) {
    const ms = base + d * 86400000 + hhmm(trip.reportUtc) * 60000
    if (nyDate(ms) === startDate) return ms
  }
  return null
}

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** BidPro "DAY" column: UTC weekday and day of month, e.g. SU13. */
export const utcDay = (ms: number): string => {
  const d = new Date(ms)
  return `${WD[d.getUTCDay()]}${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Local weekday + hour at the airport, e.g. SU07, from the UTC instant and the printed local hour.
 * (The Trips PDF gives the local hour only, so the offset is derived from the hour difference.)
 */
export function localWeekdayHour(ms: number, localHour: number): string {
  const utcHour = new Date(ms).getUTCHours()
  let off = localHour - utcHour
  if (off > 14) off -= 24
  if (off < -12) off += 24
  const wd = new Date(ms + off * 3600000).getUTCDay()
  return `${WD[wd]}${String(localHour).padStart(2, '0')}`
}

export type LayoverTone = 'plain' | 'company-dh' | 'commercial' | 'lo'

export interface LayoverLabel {
  text: string
  tone: LayoverTone
}

/** Colour class of a layover airport: blue after a company deadhead, red after a commercial / LIMO / BUS leg. */
export function toneOfLegKind(kind: string | undefined): LayoverTone {
  if (kind === 'deadhead-company') return 'company-dh'
  if (kind === 'deadhead-commercial' || kind === 'ground') return 'commercial'
  return 'plain'
}

/**
 * For every calendar date of a line: the layover airport on the date the pilot goes to bed away from base, and
 * `L/O` on the following dates of a multi-day layover. Keyed by ISO date.
 */
export function layoverLabels(line: Line, trips: Map<string, Trip>): Map<string, LayoverLabel> {
  const out = new Map<string, LayoverLabel>()
  for (const inst of line.tripInstances) {
    const t = trips.get(inst.tripId)
    if (!t) continue
    const rep = reportInstantMs(t, inst.startDate)
    if (rep == null) continue
    for (let k = 0; k < t.duties.length - 1; k++) {
      const d = t.duties[k]
      const next = t.duties[k + 1]
      if (d.releaseMin == null) continue
      const city = t.overnights[k] ?? d.legs[d.legs.length - 1].arr
      const release = nyDate(rep + d.releaseMin * 60000)
      const back = nyDate(rep + next.reportMin * 60000)
      // normally the layover is labelled on the date the duty ends. An overnight duty (e.g. gateway standby 19:00-02:00 local)
      // ends on the same local date the next one starts, so it is labelled on the date the duty began instead.
      const bed = back > release ? release : nyDate(rep + d.reportMin * 60000)
      if (back <= bed) continue
      out.set(bed, { text: city, tone: toneOfLegKind(d.legs[d.legs.length - 1].kind) })
      for (let day = Date.parse(bed + 'T12:00:00Z') + 86400000; nyDate(day) < back; day += 86400000) {
        out.set(nyDate(day), { text: 'L/O', tone: 'lo' })
      }
    }
  }
  return out
}
