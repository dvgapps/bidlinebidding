import type { Bundle, DayKind, Line, Trip } from '../types'
import { isEdwTrip } from './tripTime'

/** Line guarantee per 28-day pay period (BRIEFING 8.6), in minutes. */
export const LINE_GUARANTEE_MIN = 75 * 60

export interface LineMetrics {
  number: number
  /** credit minutes per PP as printed (null when the PDF has none) */
  ctPP: (number | null)[]
  /** credit per PP as shown in the TC column: printed credit, or 75:00 when the PP has none (reserve/VTO/VTOR) */
  tcPP: number[]
  /** sum of TC per PP floored at the 75:00 line guarantee (minutes) */
  payMin: number
  /** total block as printed (minutes) */
  btMin: number
  /** printed days off / duty days, summed over both PPs */
  doPrinted: number
  ddPrinted: number
  /** days off derived from the 56-day grid (off, VTO, VTOR) */
  daysOff: number
  longestOff: number
  tripCount: number
  tafbMin: number
  /** share of flown legs touching a non-US/Canada/Mexico airport; null when nothing is flown */
  intlPct: number | null
  /** Saturdays / Sundays / full Sat+Sun weekends off, 0..1 */
  satOffPct: number
  sunOffPct: number
  wkndOffPct: number
  creditCodes: string[]
  /** trips that end with / start with a commercial deadhead, and trips with both */
  commHome: number
  commWork: number
  commBoth: number
  /** trips you must travel to work for: every trip except one that starts the day (or day after) the previous one ends */
  commutes: number
  /** 1 for a base trip line */
  baseTrip: number
  /** credit (minutes) of trips still running when the bid period ends, that is paid in the next bid period */
  carryOutMin: number
  /** share of the line's trips that touch the Early Duty Window (02:30-04:59 LDT); null with no trips */
  edwPct: number | null
  /** total duty time of all trips (minutes) */
  tdtMin: number
}

export const hm = (s: string | null | undefined): number | null => {
  if (!s) return null
  const [h, m] = s.split(':')
  return Number(h) * 60 + Number(m)
}

/** Decimal hours with one decimal, the way BidPro shows credit (150.0). */
export const fmtDec = (min: number | null | undefined): string => (min == null ? '–' : (min / 60).toFixed(1))

export const fmtHM =(min: number | null | undefined): string => {
  if (min == null) return '–'
  const h = Math.floor(min / 60)
  return `${h}:${String(Math.round(min % 60)).padStart(2, '0')}`
}

const OFF_KINDS: ReadonlySet<DayKind> = new Set<DayKind>(['off', 'VTO', 'VTOR'])
export const isOff = (k: DayKind): boolean => OFF_KINDS.has(k)

/** 0 = Sunday .. 6 = Saturday for an ISO date, independent of the viewer's time zone. */
export const weekday = (iso: string): number => new Date(iso + 'T12:00:00Z').getUTCDay()

/** Whole days from ISO date `a` to `b`. */
const dayGap = (a: string, b: string): number => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)

export function computeLineMetrics(
  line: Line,
  trips: Map<string, Trip>,
  airports: Bundle['airports'],
): LineMetrics {
  const ctPP = line.pp.map((p) => hm(p.ct))
  // Reserve, VTO and VTOR PPs print no credit; BidPro shows them as 75:00 (Pay 150.0, TC 75/75)
  const tcPP = ctPP.map((c) => (c != null && c > 0 ? c : LINE_GUARANTEE_MIN))
  const payMin = tcPP.reduce((s, c) => s + Math.max(c, LINE_GUARANTEE_MIN), 0)
  const btMin = line.pp.reduce((s, p) => s + (hm(p.bt) ?? 0), 0)
  const doPrinted = line.pp.reduce((s, p) => s + (p.do ?? 0), 0)
  const ddPrinted = line.pp.reduce((s, p) => s + (p.dd ?? 0), 0)

  let daysOff = 0
  let longestOff = 0
  let run = 0
  for (const d of line.days) {
    if (isOff(d.kind)) {
      daysOff++
      run++
      longestOff = Math.max(longestOff, run)
    } else run = 0
  }

  let tafbMin = 0
  let flown = 0
  let intl = 0
  const codes = new Set<string>()
  for (const inst of line.tripInstances) {
    const t = trips.get(inst.tripId)
    if (!t) continue
    tafbMin += t.tafb
    codes.add(t.creditCode)
    for (const d of t.duties)
      for (const g of d.legs) {
        if (g.kind !== 'flight') continue
        flown++
        if (airports[g.dep]?.intl || airports[g.arr]?.intl) intl++
      }
  }

  // commuting, carry-out credit, Early Duty Window, total duty time
  let commHome = 0, commWork = 0, commBoth = 0, commutes = 0, carryOutMin = 0, tdtMin = 0, edwTrips = 0, edwKnown = 0
  const lastDate = line.days[line.days.length - 1]?.date ?? ''
  let prevEnd: string | null = null
  for (const inst of [...line.tripInstances].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))) {
    const t = trips.get(inst.tripId)
    if (!t) continue
    const first = t.duties[0]?.legs[0]
    const last = t.duties[t.duties.length - 1]?.legs.at(-1)
    const work = first?.kind === 'deadhead-commercial'
    const home = last?.kind === 'deadhead-commercial'
    if (work) commWork++
    if (home) commHome++
    if (work && home) commBoth++
    // a commute is needed unless this trip starts the same day, or the day after, the previous one ended
    if (prevEnd == null || dayGap(prevEnd, inst.startDate) > 1) commutes++
    if (prevEnd == null || inst.endDate > prevEnd) prevEnd = inst.endDate
    if (inst.endDate > lastDate && inst.credit && inst.ppCredit) carryOutMin += Math.max(0, (hm(inst.credit) ?? 0) - (hm(inst.ppCredit) ?? 0))
    tdtMin += t.duty ?? 0
    const edw = isEdwTrip(t, inst.startDate)
    if (edw != null) {
      edwKnown++
      if (edw) edwTrips++
    }
  }

  // weekends: Saturdays / Sundays inside the 56 days; a weekend is a Sat with the following Sun both inside
  let sat = 0, satOff = 0, sun = 0, sunOff = 0, wk = 0, wkOff = 0
  line.days.forEach((d, i) => {
    const wd = weekday(d.date)
    if (wd === 6) {
      sat++
      if (isOff(d.kind)) satOff++
      const next = line.days[i + 1]
      if (next) {
        wk++
        if (isOff(d.kind) && isOff(next.kind)) wkOff++
      }
    } else if (wd === 0) {
      sun++
      if (isOff(d.kind)) sunOff++
    }
  })

  return {
    number: line.number,
    ctPP,
    tcPP,
    payMin,
    btMin,
    doPrinted,
    ddPrinted,
    daysOff,
    longestOff,
    tripCount: line.tripInstances.length,
    tafbMin,
    intlPct: flown ? intl / flown : null,
    satOffPct: sat ? satOff / sat : 0,
    sunOffPct: sun ? sunOff / sun : 0,
    wkndOffPct: wk ? wkOff / wk : 0,
    creditCodes: [...codes].sort(),
    commHome,
    commWork,
    commBoth,
    commutes,
    baseTrip: line.type === 'base-trip' ? 1 : 0,
    carryOutMin,
    edwPct: edwKnown ? edwTrips / edwKnown : null,
    tdtMin,
  }
}

export function computeAllMetrics(bundle: Bundle): Map<number, LineMetrics> {
  const trips = new Map(bundle.trips.map((t) => [t.id, t]))
  return new Map(bundle.lines.map((l) => [l.number, computeLineMetrics(l, trips, bundle.airports)]))
}
