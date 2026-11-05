import { useState } from 'react'
import { ipaSummary } from '../lib/ipaSummary'
import { useStore } from '../store'
import { Icon } from './Icon'
import { MoveMenu } from './MoveMenu'
import { PreferencesPanel } from './PreferencesPanel'
import { SortPanel } from './SortPanel'

export function Toolbar() {
  const { selected, clearSelection, history, undo, redo, desired, showDesired, setShowDesired, vacation, showVacation, setShowVacation, ipa, refreshIpa, newPackage, loadServerPackage } = useStore()
  const [panel, setPanel] = useState<null | 'move' | 'sort' | 'prefs'>(null)
  return (
    <div className="toolbar">
      <button onClick={() => setPanel('move')}>Move Lines…</button>
      <button className="with-icon" onClick={() => setPanel('sort')}>
        Sort
        <Icon name="sort" size={18} />
      </button>
      {selected.size > 0 && (
        <button className="chip on" onClick={clearSelection} title="Clear selection">
          {selected.size} selected ✕
        </button>
      )}
      <span className="sep" />
      <button className="with-icon" onClick={undo} disabled={history.past.length === 0} aria-label="Undo">
        <Icon name="undo" size={18} />
        Undo
      </button>
      <button className="with-icon" onClick={redo} disabled={history.future.length === 0} aria-label="Redo">
        Redo
        <Icon name="redo" size={18} />
      </button>
      <span className="sep" />
      <button
        className={`chip want ${showDesired ? 'on' : ''}`}
        aria-pressed={showDesired}
        onClick={() => setShowDesired(!showDesired)}
        title="Show or hide your desired dates off on the lines"
        disabled={desired.length === 0}
      >
        Dates OFF
      </button>
      <button
        className={`chip vac ${showVacation ? 'on' : ''}`}
        aria-pressed={showVacation}
        onClick={() => setShowVacation(!showVacation)}
        title="Show or hide vacation shading"
        disabled={vacation.length === 0}
      >
        Vacation
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
        <Icon name="refresh" size={14} className={ipa.status === 'loading' ? 'spin' : ''} />
      </button>
      <span className={`ipa-note ${ipa.status === 'error' || ipa.message ? 'warn' : 'muted'}`} aria-live="polite">
        {ipa.status === 'error' || ipa.message
          ? ipa.message
          : ipa.snapshot
            ? ipaSummary(ipa.snapshot)
            : 'IPA: not loaded'}
      </span>
      {panel === 'move' && <MoveMenu onClose={() => setPanel(null)} />}
      {panel === 'sort' && <SortPanel onClose={() => setPanel(null)} />}
      {panel === 'prefs' && <PreferencesPanel onClose={() => setPanel(null)} />}
    </div>
  )
}
