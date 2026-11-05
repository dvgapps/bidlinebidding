import { useState } from 'react'
import { ipaSummary } from '../lib/ipaSummary'
import { useStore } from '../store'
import { ExportDialog } from './ExportDialog'
import { MoveMenu } from './MoveMenu'
import { PreferencesPanel } from './PreferencesPanel'

export function Toolbar() {
  const { selected, clearSelection, history, undo, redo, desired, showDesired, setShowDesired, vacation, showVacation, setShowVacation, ipa, refreshIpa, newPackage, loadServerPackage } = useStore()
  const [panel, setPanel] = useState<null | 'move' | 'export' | 'prefs'>(null)
  return (
    <div className="toolbar">
      <button onClick={() => setPanel('move')}>Move Lines…</button>
      {selected.size > 0 && (
        <button className="chip on" onClick={clearSelection} title="Clear selection">
          {selected.size} selected ✕
        </button>
      )}
      <span className="sep" />
      <button onClick={undo} disabled={history.past.length === 0} aria-label="Undo">
        ↶ Undo
      </button>
      <button onClick={redo} disabled={history.future.length === 0} aria-label="Redo">
        Redo ↷
      </button>
      <span className="sep" />
      <button
        className={`chip want ${showDesired ? 'on' : ''}`}
        aria-pressed={showDesired}
        onClick={() => setShowDesired(!showDesired)}
        title="Show or hide your desired dates off on the lines"
        disabled={desired.length === 0}
      >
        Dates off {showDesired ? 'on' : 'off'}
      </button>
      <button
        className={`chip vac ${showVacation ? 'on' : ''}`}
        aria-pressed={showVacation}
        onClick={() => setShowVacation(!showVacation)}
        title="Show or hide vacation shading"
        disabled={vacation.length === 0}
      >
        Vacation {showVacation ? 'on' : 'off'}
      </button>
      {newPackage && (
        <button
          className="primary"
          onClick={() => {
            if (window.confirm(`Load the new package for bid ${newPackage.id} from your server? Your worksheets for the loaded bid are kept.`)) void loadServerPackage(newPackage.id)
          }}
          title="A newer bid package was published to your server"
        >
          New package {newPackage.id} ↓
        </button>
      )}
      <button onClick={() => setPanel('prefs')}>Preferences</button>
      <span className="sep" />
      <button className="hold-btn" onClick={() => void refreshIpa()} disabled={ipa.status === 'loading'} title="Fetch the IPA Snapshot: which of your bid lines you can hold">
        {ipa.status === 'loading' ? 'Loading…' : 'Holding'}
        <svg className={`refresh-ico ${ipa.status === 'loading' ? 'spin' : ''}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20 4v5h-5" />
        </svg>
      </button>
      <span className={`ipa-note ${ipa.status === 'error' || ipa.message ? 'warn' : 'muted'}`} aria-live="polite">
        {ipa.status === 'error' || ipa.message
          ? ipa.message
          : ipa.snapshot
            ? ipaSummary(ipa.snapshot)
            : 'IPA: not loaded'}
      </span>
      <span className="sep" />
      <button className="primary push" onClick={() => setPanel('export')}>
        Export
      </button>
      {panel === 'move' && <MoveMenu onClose={() => setPanel(null)} />}
      {panel === 'export' && <ExportDialog onClose={() => setPanel(null)} />}
      {panel === 'prefs' && <PreferencesPanel onClose={() => setPanel(null)} />}
    </div>
  )
}
