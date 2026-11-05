import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef } from 'react'
import type { Line } from '../types'
import { addDays, desiredDates } from '../lib/dto'
import { holdLabel, holdLineClass } from '../lib/ipa'
import { DAY_CLASS, DAY_TEXT, MONTH_SHORT, WEEKDAY_SHORT } from '../lib/labels'
import { weekday } from '../lib/metrics'
import { layoverLabels, zCoverage } from '../lib/tripTime'
import { useFmt } from '../lib/useFmt'
import { useStore } from '../store'
import { useRowDrag } from './useRowDrag'
import { useResetScroll } from './useResetScroll'

const CELL = 28
const LABEL_W = 236
const ROW_H = 42
const HEAD_H = 44

export function CalendarView({ lines }: { lines: Line[] }) {
  const { bundle, hold, metrics, selectLine, selectTrip, desired, showDesired, carry, vacation, showVacation, dto, lists, sheet, selected, toggleSelect } =
    useStore()
  const fmt = useFmt()
  const parent = useRef<HTMLDivElement>(null)
  useResetScroll(parent)
  const want = useMemo(() => (showDesired ? desiredDates(desired) : new Set<string>()), [desired, showDesired])
  const carried = useMemo(() => desiredDates(carry), [carry])
  const vac = useMemo(() => (showVacation ? desiredDates(vacation) : new Set<string>()), [vacation, showVacation])
  const rank = useMemo(() => new Map(lists[sheet].map((n, i) => [n, i + 1])), [lists, sheet])
  const trips = useMemo(() => new Map((bundle?.trips ?? []).map((t) => [t.id, t])), [bundle])
  // each line's layover labels and Z-date trip coverage, worked out once per line (not on every render of a row)
  const timelines = useMemo(() => {
    const cache = new Map<number, { labels: ReturnType<typeof layoverLabels>; cover: ReturnType<typeof zCoverage> }>()
    return (l: Line) => {
      let t = cache.get(l.number)
      if (!t) {
        t = { labels: layoverLabels(l, trips), cover: zCoverage(l, trips) }
        cache.set(l.number, t)
      }
      return t
    }
  }, [trips])
  const order = useMemo(() => lines.map((l) => l.number), [lines])
  const { drag, handleProps } = useRowDrag({ parent, order, rowH: ROW_H, headH: HEAD_H })
  const v = useVirtualizer({ count: lines.length, getScrollElement: () => parent.current, estimateSize: () => ROW_H, overscan: 10 })
  const periodDates = bundle!.lines[0].days.map((d) => d.date)
  // trips that run past the last bid day are shown in full: extra columns up to the last day any trip reaches
  const extraDates = useMemo(() => {
    const last = periodDates[periodDates.length - 1]
    let end = last
    for (const l of bundle!.lines) for (const date of timelines(l).cover.keys()) if (date > end) end = date
    const out: string[] = []
    end = addDays(end, 1) // one blank day after the longest trip, so its end is clear
    for (let d = addDays(last, 1); d <= end; d = addDays(d, 1)) out.push(d)
    return out
  }, [bundle, periodDates, timelines])
  const dates = [...periodDates, ...extraDates]
  const width = LABEL_W + dates.length * CELL

  return (
    <div className="cal-wrap" ref={parent}>
      <div style={{ width }}>
        <div className="cal-head" style={{ height: HEAD_H }}>
          <span className="cal-label sticky">
            <span className="cal-grip" />
            <span className="check" />
            <span className="abs">#</span>
            <span className="lbl">Line</span>
            <span className="cal-hold">Holding</span>
          </span>
          {dates.map((d, i) => {
            const day = Number(d.slice(8))
            const wd = weekday(d)
            return (
              <span
                key={d}
                className={`cal-h ${wd === 0 || wd === 6 ? 'wkend' : ''} ${i === 28 ? 'pp2' : ''} ${i === periodDates.length ? 'beyond-start' : ''} ${i >= periodDates.length ? 'beyond' : ''} ${want.has(d) ? 'want' : ''} ${vac.has(d) ? 'vac' : ''} ${carried.has(d) ? 'carry-h' : ''}`}
                style={{ width: CELL }}
              >
                <small>{day === 1 || i === 0 ? MONTH_SHORT[Number(d.slice(5, 7)) - 1] : ' '}</small>
                <b>{day}</b>
                <small>{WEEKDAY_SHORT[wd]}</small>
              </span>
            )
          })}
        </div>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const l = lines[vi.index]
            const m = metrics.get(l.number)!
            const d = dto.get(l.number)
            const { labels, cover } = timelines(l)
            // what each date shows: a trip on every Z date it occupies; printed trip days outside that are free days
            const cells = [...l.days, ...extraDates.map((date) => ({ date, kind: 'off' as const, tripId: undefined as string | undefined }))].map((day) => {
              const z = cover.get(day.date)
              if (z) return { date: day.date, kind: z.kind as string, tripId: z.inst.tripId, z }
              const printedTrip = day.kind === 'trip' || day.kind === 'GS' || day.kind === 'HS'
              return { date: day.date, kind: (printedTrip ? 'off' : day.kind) as string, tripId: undefined as string | undefined, z: undefined }
            })
            return (
              <div
                key={l.number}
                className={`cal-row ${selected.has(l.number) ? 'sel' : ''} ${drag?.ids.includes(l.number) ? 'dragging' : ''} ${hold.get(l.number)?.status === 'unavailable' ? 'unavail' : ''} ${holdLineClass(hold.get(l.number))}`}
                style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
                role="button"
                tabIndex={0}
                onClick={() => selectLine(l.number)}
                onKeyDown={(e) => e.key === 'Enter' && selectLine(l.number)}
              >
                <span className="cal-label sticky">
                  <span className="handle cal-grip" role="button" aria-label={`Drag line ${l.number}`} {...handleProps(l.number)}>
                    ⠿
                  </span>
                  <label className="check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(l.number)}
                      onChange={() => toggleSelect(l.number)}
                      aria-label={`Select line ${l.number}`}
                    />
                  </label>
                  <span className="abs" title="Position in this worksheet">
                    {rank.get(l.number)}
                  </span>
                  <span className="lbl">
                    <b>
                      <span className="numtxt">{l.number}</span>
                    </b>
                    <small>
                      {fmt(m.payMin)}
                      {d?.pct != null && ` · ${Math.round(d.pct * 100)}%`}
                    </small>
                  </span>
                  <span className="cal-hold" title="IPA Snapshot: can you hold this line? (an aid, not authority)">
                    {hold.has(l.number) && (
                      <span className={`hold-${hold.get(l.number)!.status}`}>{holdLabel(hold.get(l.number))}</span>
                    )}
                  </span>
                </span>
                {cells.map((day, i) => {
                  const extra = i >= l.days.length
                  const kind = day.kind as Line['days'][number]['kind']
                  const wd = weekday(day.date)
                  const wanted = !extra && want.has(day.date)
                  // VTO and VTOR are Z3 duties (opaque over the desired-date colour), so they get the conflict box like a trip
                  const off = DAY_CLASS[kind] === 'off'
                  const isTrip = kind === 'trip' || kind === 'GS' || kind === 'HS'
                  const lab = isTrip ? labels.get(day.date) : undefined
                  const inst = day.z?.inst
                  // the thicker separator only where a trip starts right after another trip (they touch)
                  const prevKind = i > 0 ? cells[i - 1].kind : undefined
                  const touchesPrev = prevKind === 'trip' || prevKind === 'GS' || prevKind === 'HS'
                  return (
                    <span
                      key={day.date}
                      className={`cal-c k-${extra && !day.z ? 'beyond' : DAY_CLASS[kind]} ${extra ? 'beyond' : ''} ${i === l.days.length ? 'beyond-start' : ''} ${wd === 0 || wd === 6 ? 'wkend' : ''} ${i === 28 ? 'pp2' : ''} ${day.z?.zStart === day.date && touchesPrev ? 'start' : ''} ${wanted ? (off ? 'want-ok' : 'want-clash') : ''} ${!extra && carried.has(day.date) ? (kind === 'off' ? 'carry-in' : 'carry-clash') : ''} ${!extra && vac.has(day.date) ? 'vac' : ''} ${inst ? 'trip-hit' : ''}`}
                      style={{ width: CELL }}
                      title={day.tripId ? `${day.date}  trip ${day.tripId}` : day.date}
                      onClick={
                        inst
                          ? (e) => {
                              e.stopPropagation()
                              selectTrip({ id: inst.tripId, line: l.number, date: inst.startDate })
                            }
                          : undefined
                      }
                    >
                      {lab ? <span className={`lay ${lab.tone}`}>{lab.text}</span> : kind === 'HS' ? DAY_TEXT.HS : isTrip || (extra && !day.z) ? '' : DAY_TEXT[kind]}
                    </span>
                  )
                })}
              </div>
            )
          })}
          {drag && <div className="drop-line" style={{ transform: `translateY(${drag.gap * ROW_H}px)` }} aria-hidden />}
        </div>
      </div>
      {drag && (
        <div className="ghost" style={{ left: drag.x + 12, top: drag.y - 16 }} aria-hidden>
          {drag.ids.length === 1 ? `Line ${drag.ids[0]}` : `${drag.ids.length} lines`}
        </div>
      )}
    </div>
  )
}
