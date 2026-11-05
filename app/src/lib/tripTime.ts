import type { Line, Trip } from '../types'

/** Calendar days in the app are domicile-local (America/New_York); see BRIEFING 8.1. */
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
export const nyDate = (ms: number): string => NY.format(ms)

/** UTC calendar date of an instant: BidPro dates everything shown on the calendar by the Z date. */
export const utcDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

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
  const put = (date: string, label: LayoverLabel, overwrite = true) => {
    if (overwrite || !out.has(date)) out.set(date, label)
  }
  for (const inst of line.tripInstances) {
    const t = trips.get(inst.tripId)
    if (!t) continue
    const rep = reportInstantMs(t, inst.startDate)
    if (rep == null) continue
    if (t.type === 'gateway-standby' || t.type === 'hot-standby') {
      // standby duties run overnight (e.g. 19:00-02:00 local): the layover is labelled on the date the duty began
      for (let k = 0; k < t.duties.length - 1; k++) {
        const d = t.duties[k]
        const next = t.duties[k + 1]
        if (d.releaseMin == null) continue
        const city = t.overnights[k] ?? d.legs[d.legs.length - 1].arr
        const release = nyDate(rep + d.releaseMin * 60000)
        const back = nyDate(rep + next.reportMin * 60000)
        const bed = back > release ? release : nyDate(rep + d.reportMin * 60000)
        if (back <= bed) continue
        put(bed, { text: city, tone: toneOfLegKind(d.legs[d.legs.length - 1].kind) })
        for (let day = Date.parse(bed + 'T12:00:00Z') + 86400000; nyDate(day) < back; day += 86400000) {
          put(nyDate(day), { text: 'L/O', tone: 'lo' })
        }
      }
      continue
    }
    // BidPro style: every duty is labelled with the airport where it ends, on the Z (UTC) date it ends (the last one, the
    // return to base, included); the days between one such date and the next are L/O. A rest of 10:30 or more before the
    // next duty is a hotel layover even when the next duty reports the same Z date (e.g. trip 5082 at PHX).
    const ends: { date: string; label: LayoverLabel }[] = []
    t.duties.forEach((d, k) => {
      if (d.releaseMin == null) return
      const lastLeg = d.legs[d.legs.length - 1]
      const city = k < t.duties.length - 1 ? (t.overnights[k] ?? lastLeg.arr) : lastLeg.arr
      // the first duty is always shown on the first day, even when it ends after midnight Z (trip 5746: CGN on the 24th)
      ends.push({ date: k === 0 ? utcDate(rep) : utcDate(rep + d.releaseMin * 60000), label: { text: city, tone: toneOfLegKind(lastLeg.kind) } })
    })
    ends.forEach((e, i) => {
      // the layover wins over the return label when both fall on the same date
      put(e.date, e.label, i < ends.length - 1)
      const nextDate = ends[i + 1]?.date
      if (!nextDate) return
      for (let day = Date.parse(e.date + 'T12:00:00Z') + 86400000; utcDate(day) < nextDate; day += 86400000) {
        put(utcDate(day), { text: 'L/O', tone: 'lo' }, false)
      }
    })
  }
  return out
}

export interface ZCover {
  inst: Line['tripInstances'][number]
  kind: Line['days'][number]['kind']
  zStart: string
  zEnd: string
}

/**
 * Which calendar dates each trip occupies, by Z date: from the Z date of its report to the Z date of its final release
 * (so a trip landing at 03:07Z on the 3rd is on the calendar through the 3rd). Standby trips keep their printed dates.
 */
export function zCoverage(line: Line, trips: Map<string, Trip>): Map<string, ZCover> {
  const out = new Map<string, ZCover>()
  for (const inst of line.tripInstances) {
    const t = trips.get(inst.tripId)
    const src = line.days.find((d) => d.date === inst.startDate)?.kind
    const kind = src === 'GS' || src === 'HS' ? src : 'trip'
    let zStart = inst.startDate
    let zEnd = inst.endDate
    const rep = t && t.type !== 'gateway-standby' && t.type !== 'hot-standby' ? reportInstantMs(t, inst.startDate) : null
    if (t && rep != null) {
      const rel = t.duties[t.duties.length - 1]?.releaseMin
      zStart = utcDate(rep)
      if (rel != null) zEnd = utcDate(rep + rel * 60000)
    }
    for (let ms = Date.parse(zStart + 'T12:00:00Z'); utcDate(ms) <= zEnd; ms += 86400000) {
      out.set(utcDate(ms), { inst, kind, zStart, zEnd })
    }
  }
  return out
}
