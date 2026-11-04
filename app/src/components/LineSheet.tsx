import type { Line } from '../types'
import { DAY_CLASS, DAY_TEXT, TYPE_CLASS, TYPE_LABEL, WEEKDAY_SHORT } from '../lib/labels'
import { weekday } from '../lib/metrics'
import { desiredDates } from '../lib/dto'
import { useFmt } from '../lib/useFmt'
import { useStore } from '../store'

const dateLabel = (iso: string) => {
  const d = new Date(iso + 'T12:00:00Z')
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

function PPGrid({ line, k, want, vac, carried }: { line: Line; k: number; want: Set<string>; vac: Set<string>; carried: Set<string> }) {
  const days = line.days.slice(k * 28, k * 28 + 28)
  const pp = line.pp[k]
  const starts = new Set(line.tripInstances.map((t) => t.startDate))
  return (
    <section className="ppgrid">
      <h3>
        {pp.label} <span className="muted">({pp.id})</span>
        <span className="muted stats">
          CT {pp.ct ?? '–'} · BT {pp.bt ?? '–'} · DO {pp.do ?? '–'} · DD {pp.dd ?? '–'}
        </span>
      </h3>
      <div className="grid7">
        {WEEKDAY_SHORT.map((w, i) => (
          <span key={i} className="gh">
            {w}
          </span>
        ))}
        {days.map((d) => (
          <span
            key={d.date}
            className={`gc k-${DAY_CLASS[d.kind]} ${weekday(d.date) % 6 === 0 ? 'wkend' : ''} ${want.has(d.date) ? 'want' : ''} ${vac.has(d.date) ? 'vac' : ''} ${carried.has(d.date) ? (d.kind === 'off' ? 'carry-in' : 'carry-clash') : ''}`}
            title={d.tripId ? `trip ${d.tripId}` : undefined}
          >
            <small>{Number(d.date.slice(8))}</small>
            <b>{d.kind === 'trip' || d.kind === 'GS' ? (starts.has(d.date) ? (d.tripId ?? '') : '') : DAY_TEXT[d.kind]}</b>
          </span>
        ))}
      </div>
    </section>
  )
}

export function LineSheet() {
  const { bundle, selectedLine, selectLine, selectTrip, metrics, desired, showDesired, carry, vacation, showVacation, dto, hold } = useStore()
  const fmt = useFmt()
  if (selectedLine == null || !bundle) return null
  const line = bundle.lines.find((l) => l.number === selectedLine)
  if (!line) return null
  const m = metrics.get(line.number)!
  const trips = new Map(bundle.trips.map((t) => [t.id, t]))
  return (
    <div className="scrim" onClick={() => selectLine(null)}>
      <aside className="sheet" role="dialog" aria-label={`Line ${line.number}`} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>
            Line {line.number} <span className={`badge k-${TYPE_CLASS[line.type]}`}>{TYPE_LABEL[line.type]}</span>
          </h2>
          <button onClick={() => selectLine(null)} aria-label="Close">
            Close
          </button>
        </header>
        {line.comment && <p className="muted">{line.comment}</p>}
        {hold.has(line.number) && (
          <p>
            IPA Snapshot (your bid #{hold.get(line.number)!.choice}):{' '}
            <strong className={`hold-${hold.get(line.number)!.status}`}>
              {hold.get(line.number)!.status === 'current' ? 'you hold this line' : hold.get(line.number)!.status === 'available' ? 'holdable at your seniority' : 'taken by someone senior'}
            </strong>
          </p>
        )}
        <p className="muted">
          Seats: CPT {line.seats.captain} · FO {line.seats.firstOfficer} · Pay {fmt(m.payMin)} · TB {fmt(m.btMin)} · TAFB{' '}
          {fmt(m.tafbMin)} · Longest off {m.longestOff} d{dto.get(line.number)?.pct != null && ` · DTO ${Math.round(dto.get(line.number)!.pct! * 100)}%`}
        </p>
        <div className="grids">
          {line.pp.map((_p, k) => (
            <PPGrid key={k} line={line} k={k} carried={desiredDates(carry)} want={showDesired ? desiredDates(desired) : new Set<string>()} vac={showVacation ? desiredDates(vacation) : new Set<string>()} />
          ))}
        </div>
        {line.tripInstances.length > 0 && (
          <table className="trips">
            <thead>
              <tr>
                <th>Dates</th>
                <th>Trip</th>
                <th>Report (Z)</th>
                <th>Overnights</th>
                <th className="r">Credit</th>
              </tr>
            </thead>
            <tbody>
              {line.tripInstances.map((i) => {
                const t = trips.get(i.tripId)
                return (
                  <tr key={i.tripId + i.startDate} onClick={() => selectTrip({ id: i.tripId, line: line.number, date: i.startDate })} tabIndex={0}>
                    <td>
                      {dateLabel(i.startDate)}
                      {i.endDate !== i.startDate && ` – ${dateLabel(i.endDate)}`}
                    </td>
                    <td>{i.tripId}</td>
                    <td>{i.reportUtc}</td>
                    <td>{t?.overnights.join(' ') || '–'}</td>
                    <td className="r">
                      {i.credit}
                      {t && <small className="muted"> {t.creditCode}</small>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </aside>
    </div>
  )
}
