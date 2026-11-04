import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef } from 'react'
import type { Line } from '../types'
import { desiredDates } from '../lib/dto'
import { holdLabel } from '../lib/ipa'
import { DAY_CLASS, DAY_TEXT, MONTH_SHORT, WEEKDAY_SHORT } from '../lib/labels'
import { weekday } from '../lib/metrics'
import { layoverLabels } from '../lib/tripTime'
import { useFmt } from '../lib/useFmt'
import { useStore } from '../store'
import { useRowDrag } from './useRowDrag'

const CELL = 28
const LABEL_W = 236
const ROW_H = 42
const HEAD_H = 44

export function CalendarView({ lines }: { lines: Line[] }) {
  const { bundle, hold, metrics, selectLine, selectTrip, desired, showDesired, carry, vacation, showVacation, dto, lists, sheet, selected, toggleSelect } =
    useStore()
  const fmt = useFmt()
  const parent = useRef<HTMLDivElement>(null)
  const want = useMemo(() => (showDesired ? desiredDates(desired) : new Set<string>()), [desired, showDesired])
  const carried = useMemo(() => desiredDates(carry), [carry])
  const vac = useMemo(() => (showVacation ? desiredDates(vacation) : new Set<string>()), [vacation, showVacation])
  const rank = useMemo(() => new Map(lists[sheet].map((n, i) => [n, i + 1])), [lists, sheet])
  const trips = useMemo(() => new Map((bundle?.trips ?? []).map((t) => [t.id, t])), [bundle])
  const order = useMemo(() => lines.map((l) => l.number), [lines])
  const { drag, handleProps } = useRowDrag({ parent, order, rowH: ROW_H, headH: HEAD_H })
  const v = useVirtualizer({ count: lines.length, getScrollElement: () => parent.current, estimateSize: () => ROW_H, overscan: 10 })
  const dates = bundle!.lines[0].days.map((d) => d.date)
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
            <span className="cal-hold">Hold</span>
          </span>
          {dates.map((d, i) => {
            const day = Number(d.slice(8))
            const wd = weekday(d)
            return (
              <span
                key={d}
                className={`cal-h ${wd === 0 || wd === 6 ? 'wkend' : ''} ${i === 28 ? 'pp2' : ''} ${want.has(d) ? 'want' : ''} ${vac.has(d) ? 'vac' : ''} ${carried.has(d) ? 'carry-h' : ''}`}
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
            const labels = layoverLabels(l, trips)
            const instanceFor = (tripId: string, date: string) =>
              l.tripInstances.find((t) => t.tripId === tripId && t.startDate <= date && date <= t.endDate)
            return (
              <div
                key={l.number}
                className={`cal-row ${selected.has(l.number) ? 'sel' : ''} ${drag?.ids.includes(l.number) ? 'dragging' : ''} ${hold.get(l.number)?.status === 'unavailable' ? 'unavail' : ''}`}
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
                {l.days.map((day, i) => {
                  const wd = weekday(day.date)
                  const wanted = want.has(day.date)
                  const off = DAY_CLASS[day.kind] === 'off' || day.kind === 'VTO' || day.kind === 'VTOR'
                  const isTrip = day.kind === 'trip' || day.kind === 'GS' || day.kind === 'HS'
                  const lab = isTrip ? labels.get(day.date) : undefined
                  const inst = isTrip && day.tripId ? instanceFor(day.tripId, day.date) : undefined
                  // the thicker separator only where a trip starts right after another trip (they touch)
                  const prev = i > 0 ? l.days[i - 1] : undefined
                  const touchesPrev = !!prev && (prev.kind === 'trip' || prev.kind === 'GS' || prev.kind === 'HS')
                  return (
                    <span
                      key={day.date}
                      className={`cal-c k-${DAY_CLASS[day.kind]} ${wd === 0 || wd === 6 ? 'wkend' : ''} ${i === 28 ? 'pp2' : ''} ${inst?.startDate === day.date && touchesPrev ? 'start' : ''} ${wanted ? (off ? 'want-ok' : 'want-clash') : ''} ${carried.has(day.date) ? (day.kind === 'off' ? 'carry-in' : 'carry-clash') : ''} ${vac.has(day.date) ? 'vac' : ''} ${inst ? 'trip-hit' : ''}`}
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
                      {lab ? <span className={`lay ${lab.tone}`}>{lab.text}</span> : day.kind === 'HS' ? DAY_TEXT.HS : isTrip ? '' : DAY_TEXT[day.kind]}
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
