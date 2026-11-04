import { SHEETS } from '../lib/rank'
import { useStore } from '../store'

export function SheetTabs() {
  const { sheet, setSheet, lists } = useStore()
  return (
    <nav className="tabs" role="tablist" aria-label="Worksheets">
      {SHEETS.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={sheet === s.id}
          className={sheet === s.id ? 'on' : ''}
          onClick={() => setSheet(s.id)}
        >
          {s.label} ({lists[s.id].length})
        </button>
      ))}
    </nav>
  )
}
