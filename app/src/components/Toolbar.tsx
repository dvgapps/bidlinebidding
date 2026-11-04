import { useState } from 'react'
import { useStore } from '../store'
import { ExportDialog } from './ExportDialog'
import { MoveMenu } from './MoveMenu'
import { PreferencesPanel } from './PreferencesPanel'

export function Toolbar() {
  const { selected, clearSelection, history, undo, redo, desired, showDesired, setShowDesired, vacation, showVacation, setShowVacation, timeFmt, setTimeFmt, ipa, refreshIpa } = useStore()
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
      <button onClick={() => setPanel('prefs')}>Preferences</button>
      <span className="sep" />
      <button onClick={() => void refreshIpa()} disabled={ipa.status === 'loading'} title="Fetch the IPA Snapshot: which of your bid lines you can hold">
        {ipa.status === 'loading' ? 'IPA…' : 'Hold ⟳'}
      </button>
      <span className={`ipa-note ${ipa.status === 'error' || ipa.message ? 'warn' : 'muted'}`} aria-live="polite">
        {ipa.status === 'error' || ipa.message
          ? ipa.message
          : ipa.snapshot
            ? `IPA ${ipa.snapshot.updated ?? ''} · ${ipa.snapshot.seniorBids ?? '?'} senior bids · holding ${ipa.snapshot.holding ?? '–'}`
            : 'IPA: not loaded'}
      </span>
      <span className="sep" />
      <div className="seg" aria-label="Credit format">
        {(
          [
            ['decimal', '75.0'],
            ['hm', '75:00'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={timeFmt === k ? 'on' : ''} aria-pressed={timeFmt === k} onClick={() => setTimeFmt(k)}>
            {l}
          </button>
        ))}
      </div>
      <button className="primary push" onClick={() => setPanel('export')}>
        Export
      </button>
      {panel === 'move' && <MoveMenu onClose={() => setPanel(null)} />}
      {panel === 'export' && <ExportDialog onClose={() => setPanel(null)} />}
      {panel === 'prefs' && <PreferencesPanel onClose={() => setPanel(null)} />}
    </div>
  )
}
