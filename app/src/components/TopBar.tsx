import { TYPE_GROUPS, type TypeGroup } from '../lib/filter'
import { useStore } from '../store'

export function TopBar({ shown, total }: { shown: number; total: number }) {
  const { view, setView, filters, setFilters, bundle } = useStore()
  const toggle = (g: TypeGroup) =>
    setFilters({
      hidden: filters.hidden.includes(g) ? filters.hidden.filter((x) => x !== g) : [...filters.hidden, g],
    })
  const bp = bundle!.bidPeriod
  return (
    <header className="topbar">
      <div className="title">
        <strong>Bid {bp.id}</strong>
        <span className="muted">
          {bp.domicile} {bp.fleet}
        </span>
      </div>
      <div className="seg" role="tablist" aria-label="View">
        {(['table', 'calendar'] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={view === v ? 'on' : ''}
            onClick={() => setView(v)}
          >
            {v === 'table' ? 'Table' : 'Calendar'}
          </button>
        ))}
      </div>
      <div className="seg" aria-label="Seat">
        {(
          [
            ['captain', 'CPT'],
            ['firstOfficer', 'FO'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            aria-pressed={filters.seat === k}
            className={filters.seat === k ? 'on' : ''}
            onClick={() => setFilters({ seat: k })}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="chips" aria-label="Line types">
        {TYPE_GROUPS.map((g) => (
          <button
            key={g.id}
            className={`chip ${filters.hidden.includes(g.id) ? '' : 'on'}`}
            aria-pressed={!filters.hidden.includes(g.id)}
            onClick={() => toggle(g.id)}
          >
            {g.label}
          </button>
        ))}
        <button
          className={`chip ${filters.hideUnavailable ? '' : 'on'}`}
          aria-pressed={!filters.hideUnavailable}
          onClick={() => setFilters({ hideUnavailable: !filters.hideUnavailable })}
          title="Show lines the IPA Snapshot says you cannot hold"
        >
          Unavailable
        </button>
      </div>
      <input
        className="search"
        type="search"
        inputMode="search"
        placeholder="Line or comment"
        value={filters.search}
        onChange={(e) => setFilters({ search: e.target.value })}
      />
      <span className="count" aria-live="polite">
        {shown} / {total}
      </span>
    </header>
  )
}
