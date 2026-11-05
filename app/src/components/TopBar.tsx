import { useState } from 'react'
import { createPortal } from 'react-dom'
import { TYPE_GROUPS, type TypeGroup } from '../lib/filter'
import { useStore } from '../store'
import { ExportDialog } from './ExportDialog'

export function TopBar({ shown, total }: { shown: number; total: number }) {
  const { view, setView, filters, setFilters, bundle } = useStore()
  const toggle = (g: TypeGroup) =>
    setFilters({
      hidden: filters.hidden.includes(g) ? filters.hidden.filter((x) => x !== g) : [...filters.hidden, g],
    })
  const [exporting, setExporting] = useState(false)
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
      <div className="search-wrap">
        <input
          className="search"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="Search"
          aria-label="Search by line number or comment"
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value })}
        />
        {filters.search && (
          <button className="search-clear" aria-label="Clear search" onClick={() => setFilters({ search: '' })}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="9" fill="currentColor" />
              <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="var(--clear-x, #2b3942)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <button className="primary push" onClick={() => setExporting(true)}>
        Export
      </button>
      <span className="count" aria-live="polite">
        {shown} / {total}
      </span>
      {/* a portal: inside the header the header's button styles would leak into the dialog */}
      {exporting && createPortal(<ExportDialog onClose={() => setExporting(false)} />, document.body)}
    </header>
  )
}
