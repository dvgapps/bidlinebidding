import { useState } from 'react'
import { addDays } from '../lib/dto'
import { MONTH_SHORT } from '../lib/labels'

interface Props {
  value: string
  /** first / last selectable ISO date */
  min: string
  max: string
  /** highlighted range (the pair being edited) */
  range?: { start: string; end: string }
  onPick: (iso: string) => void
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Month grid limited to [min, max]; days outside the range are disabled. */
export function MiniCalendar({ value, min, max, range, onPick }: Props) {
  const [ym, setYm] = useState(value.slice(0, 7))
  const [y, m] = ym.split('-').map(Number)
  const first = `${ym}-01`
  const lead = new Date(first + 'T12:00:00Z').getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)]
  const shift = (d: number) => setYm(addDays(d < 0 ? first : `${ym}-${String(daysInMonth).padStart(2, '0')}`, d < 0 ? -1 : 1).slice(0, 7))
  const canPrev = ym > min.slice(0, 7)
  const canNext = ym < max.slice(0, 7)
  return (
    <div className="minical" role="dialog" aria-label="Choose date">
      <div className="mc-head">
        <button onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">
          ‹
        </button>
        <strong>
          {MONTHS_LONG[m - 1]} {y}
        </strong>
        <button onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="mc-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <span key={i} className="mc-w">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d == null ? (
            <span key={i} />
          ) : (
            <button
              key={d}
              className={`mc-d ${d === value ? 'on' : ''} ${range && d >= range.start && d <= range.end ? 'in' : ''}`}
              disabled={d < min || d > max}
              onClick={() => onPick(d)}
              aria-label={`${MONTH_SHORT[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8))}`}
            >
              {Number(d.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
