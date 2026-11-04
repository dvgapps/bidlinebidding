import type { Leg } from '../types'
import { localWeekdayHour, reportInstantMs, utcDay } from '../lib/tripTime'
import { useStore } from '../store'

/** BidPro formats: block and duty as hh:mm, totals and layovers with three-digit hours. */
const hh2 = (min: number | null | undefined): string =>
  min == null ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
const hh3 = (min: number | null | undefined): string =>
  min == null ? '' : `${String(Math.floor(min / 60)).padStart(3, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
const hour2 = (h: number) => String(h).padStart(2, '0')

/** DH column: DH company deadhead, CML commercial airline deadhead, DG ground (LIMO / BUS), HS standby. */
const dhCol = (g: Leg): string =>
  g.kind === 'deadhead-company' ? 'DH' : g.kind === 'deadhead-commercial' ? 'CML' : g.kind === 'ground' ? 'DG' : g.kind === 'hot-standby' ? 'HS' : ''

/** FLT column: the number without the DH / carrier prefix, as BidPro prints it. */
function fltCol(g: Leg): string {
  if (g.kind === 'ground') return /LIMO|LIM/.test(g.flight) ? 'LIMO' : 'BUS'
  if (g.kind === 'deadhead-company') return g.flight.replace(/^DH\s+UPS\s*/, '')
  if (g.kind === 'deadhead-commercial') return g.flight.replace(/^DH\s+/, '').replace(/^[A-Z0-9]{2}\s*(?=\d)/, '')
  return g.flight
}

export function TripSheet() {
  const { bundle, selectedTrip, selectTrip } = useStore()
  if (!selectedTrip || !bundle) return null
  const trip = bundle.trips.find((t) => t.id === selectedTrip.id)
  if (!trip) return null

  const line = selectedTrip.line != null ? bundle.lines.find((l) => l.number === selectedTrip.line) : undefined
  const instances = [...(line?.tripInstances ?? [])].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
  const idx = instances.findIndex((i) => i.tripId === trip.id && (!selectedTrip.date || i.startDate === selectedTrip.date))
  const go = (d: number) => {
    const n = instances[idx + d]
    if (n) selectTrip({ id: n.tripId, line: selectedTrip.line, date: n.startDate })
  }

  // UTC instant of the first report, from the local start date of the instance being viewed
  const startDate = selectedTrip.date ?? trip.reportDatesActual[0] ?? trip.reportDates[0]
  const rep = (selectedTrip.date ? reportInstantMs(trip, startDate) : null) ?? Date.parse(startDate + 'T' + trip.reportUtc + ':00Z')
  const first = trip.duties[0]

  return (
    <div className="scrim top" onClick={() => selectTrip(null)}>
      <aside className="sheet trip bp" role="dialog" aria-label={`Trip ${trip.id}`} onClick={(e) => e.stopPropagation()}>
        <header className="bp-head">
          <button className="bp-close" onClick={() => selectTrip(null)}>
            Close
          </button>
          <span className="bp-title">Trip {trip.id}</span>
          <span className="bp-title">
            Report at ({hour2(first.reportLocalHour)}) {trip.reportUtc}
          </span>
          <span className="bp-tools">
            <button aria-label="Print" onClick={() => window.print()}>
              🖨
            </button>
            <button aria-label="Previous trip" disabled={idx <= 0} onClick={() => go(-1)}>
              ◀
            </button>
            <button aria-label="Next trip" disabled={idx < 0 || idx >= instances.length - 1} onClick={() => go(1)}>
              ▶
            </button>
          </span>
        </header>

        <div className="bp-scroll">
          <table className="bp-table">
            <thead>
              <tr>
                <th>DAY</th>
                <th>DH</th>
                <th>FLT</th>
                <th>EQP</th>
                <th>DEP (L)Z</th>
                <th>M</th>
                <th>ARR (L)Z</th>
                <th>M</th>
                <th>[TOG]</th>
                <th>BLK</th>
                <th>DUTY</th>
                <th>CR</th>
                <th>L/O</th>
              </tr>
            </thead>
            {trip.duties.map((d, di) => (
              <tbody key={di}>
                {d.legs.map((g, i) => {
                  const startMs = rep + g.startMin * 60000
                  return (
                    <tr key={i}>
                      <td>{utcDay(startMs)}</td>
                      <td>{dhCol(g)}</td>
                      <td title={g.flight}>{fltCol(g)}</td>
                      <td>{g.kind === 'deadhead-commercial' ? 'CML' : g.kind === 'ground' ? '' : g.aircraft}</td>
                      <td>
                        {g.dep}({localWeekdayHour(startMs, g.startLocalHour)}){g.startUtc}
                      </td>
                      <td></td>
                      <td>
                        {g.arr}({hour2(g.endLocalHour)}){g.endUtc}
                      </td>
                      <td></td>
                      <td>{g.cxn ? `[${hh2(g.cxn)}]` : ''}</td>
                      <td>{hh2(g.block)}</td>
                      <td>{g.iro ? 'IRO' : ''}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  )
                })}
                <tr className="bp-sum">
                  <td colSpan={9}></td>
                  <td>{hh2(d.block)}</td>
                  <td>{hh2(d.duty)}</td>
                  <td>
                    {hh2(d.credit)}
                    {d.creditCode}
                  </td>
                  <td>{d.rest != null ? hh3(d.rest) : ''}</td>
                </tr>
              </tbody>
            ))}
          </table>
          <div className="bp-foot">
            <span>
              Credit: {hh3(trip.credit)}
              {'   '}Blk: {hh3(trip.block)}
            </span>
            <span>
              Ldgs: {trip.landings}.0{'   '}TAFB: {hh3(trip.tafb)}
            </span>
          </div>
        </div>
      </aside>
    </div>
  )
}
