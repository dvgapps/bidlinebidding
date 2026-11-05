import { useRef, useState, type ReactNode } from 'react'
import { formatRange, type DateRange } from '../lib/dto'
import { MiniCalendar } from './MiniCalendar'

const fmtDay = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** A row that is deleted by sliding it to the left (pointer / touch), or with Delete on the keyboard. */
function SwipeRow({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const [dx, setDx] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [swiping, setSwiping] = useState(false) // for the transition only; the gesture itself lives in `st`
  const st = useRef({ x: 0, y: 0, active: false, swiping: false, pid: 0 })
  const THRESH = 96

  return (
    <div className="swipe">
      <div className="swipe-bg" aria-hidden>
        Delete
      </div>
      <div
        className={`swipe-fg ${leaving ? 'leaving' : ''}`}
        style={{ transform: `translateX(${leaving ? -600 : dx}px)`, transition: swiping ? 'none' : 'transform 0.18s' }}
        tabIndex={0}
        aria-label={`${label}. Slide left or press Delete to remove.`}
        onKeyDown={(e) => (e.key === 'Delete' || e.key === 'Backspace') && e.target === e.currentTarget && onDelete()}
        onPointerDown={(e) => {
          st.current = { x: e.clientX, y: e.clientY, active: true, swiping: false, pid: e.pointerId }
        }}
        onPointerMove={(e) => {
          const s = st.current
          if (!s.active) return
          const mx = e.clientX - s.x
          const my = e.clientY - s.y
          if (!s.swiping && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) {
            s.swiping = true
            setSwiping(true)
            ;(e.currentTarget as HTMLElement).setPointerCapture(s.pid)
          }
          if (s.swiping) setDx(Math.min(0, mx))
        }}
        onPointerUp={() => {
          const s = st.current
          const was = s.swiping
          s.active = false
          if (was && dx < -THRESH) {
            setLeaving(true)
            setTimeout(onDelete, 160)
          } else setDx(0)
          s.swiping = false
          setSwiping(false)
        }}
        onPointerCancel={() => {
          st.current.active = false
          st.current.swiping = false
          setSwiping(false)
          setDx(0)
        }}
        onClickCapture={(e) => {
          if (Math.abs(dx) > 4) e.stopPropagation()
        }}
      >
        {children}
      </div>
    </div>
  )
}

interface Props {
  ranges: DateRange[]
  min: string
  max: string
  onUpdate: (i: number, patch: { start?: string; end?: string }) => void
  onRemove: (i: number) => void
}

/** Editable, chronologically ordered list of date ranges with mini-calendar pickers and slide-to-delete. */
export function RangeList({ ranges, min, max, onUpdate, onRemove }: Props) {
  const [open, setOpen] = useState<{ i: number; field: 'start' | 'end' } | null>(null)
  return (
    <ul className="ranges">
      {ranges.map((r, i) => (
        <li key={`${r.start}|${r.end}|${i}`}>
          <SwipeRow label={formatRange(r)} onDelete={() => onRemove(i)}>
            <div className="range-row">
              <div className="field">
                <small className="muted">Start</small>
                <button className="datebtn" onClick={() => setOpen(open?.i === i && open.field === 'start' ? null : { i, field: 'start' })}>
                  {fmtDay(r.start)}
                </button>
              </div>
              <span className="arrow" aria-hidden>
                →
              </span>
              <div className="field">
                <small className="muted">End</small>
                <button className="datebtn" onClick={() => setOpen(open?.i === i && open.field === 'end' ? null : { i, field: 'end' })}>
                  {fmtDay(r.end)}
                </button>
              </div>
            </div>
          </SwipeRow>
          {open?.i === i && (
            <MiniCalendar
              value={open.field === 'start' ? r.start : r.end}
              min={open.field === 'end' ? r.start : min}
              max={max}
              range={r}
              onPick={(iso) => {
                onUpdate(i, open.field === 'start' ? { start: iso } : { end: iso })
                setOpen(null)
              }}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
