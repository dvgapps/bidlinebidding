import { useState } from 'react'
import { criterionLabel, defaultDir, SORT_GROUPS, type SortDir } from '../lib/sorting'
import type { SortKey } from '../lib/filter'
import { useStore } from '../store'
import { Icon } from './Icon'
import { useListReorder } from './useListReorder'

const DIRS: { dir: SortDir; from: string; to: string }[] = [
  { dir: 'desc', from: 'Hi', to: 'Lo' },
  { dir: 'asc', from: 'Lo', to: 'Hi' },
]

/** Multi-level sort: pick criteria, order them with the grab bar, choose Hi to Lo or Lo to Hi for each, then Apply. */
export function SortPanel({ onClose }: { onClose: () => void }) {
  const sortCriteria = useStore((s) => s.sortCriteria)
  const setSortCriteria = useStore((s) => s.setSortCriteria)
  const applySort = useStore((s) => s.applySort)
  const [picking, setPicking] = useState(false)
  const reorder = useListReorder((from, to) => {
    const next = [...sortCriteria]
    next.splice(to, 0, next.splice(from, 1)[0])
    setSortCriteria(next)
  })
  const chosen = new Set(sortCriteria.map((c) => c.key))
  const add = (key: SortKey) => setSortCriteria([...sortCriteria, { key, dir: defaultDir(key) }])
  const remove = (key: SortKey) => setSortCriteria(sortCriteria.filter((c) => c.key !== key))
  const setDir = (key: SortKey, dir: SortDir) => setSortCriteria(sortCriteria.map((c) => (c.key === key ? { ...c, dir } : c)))

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="sheet dates sortpane" role="dialog" aria-label="Sort" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Sort</h2>
          <button onClick={onClose}>Close</button>
        </header>
        <p className="muted">
          Lines are sorted by the first criterion; lines that tie are then sorted by the second, and so on. Drag the grip to change the
          order.
        </p>

        <section className="cell" aria-label="Sort criteria">
          {sortCriteria.length === 0 && <p className="muted empty-note">No criteria yet. Tap + to add some.</p>}
          <ol className="sort-list">
            {sortCriteria.map((c, i) => (
              <li key={c.key} ref={reorder.setRow(i)} className={`sort-row ${reorder.dragging === i ? 'dragging' : ''}`}>
                <span className="sort-grab" role="button" aria-label={`Move ${criterionLabel(c.key)}`} {...reorder.handleProps(i)}>
                  <Icon name="drag_indicator" size={26} />
                </span>
                <span className="sort-num">{i + 1}</span>
                <span className="sort-name">{criterionLabel(c.key)}</span>
                <span className="seg sort-dir" role="group" aria-label={`${criterionLabel(c.key)} direction`}>
                  {DIRS.map((d) => (
                    <button key={d.dir} className={c.dir === d.dir ? 'on' : ''} aria-pressed={c.dir === d.dir} onClick={() => setDir(c.key, d.dir)}>
                      {d.from}
                      <Icon name="keyboard_double_arrow_right" size={18} />
                      {d.to}
                    </button>
                  ))}
                </span>
                <button className="icon-btn" onClick={() => remove(c.key)} aria-label={`Remove ${criterionLabel(c.key)}`}>
                  <Icon name="remove" />
                </button>
              </li>
            ))}
          </ol>
          <div className="menu-row">
            <button className="icon-btn add" onClick={() => setPicking((p) => !p)} aria-expanded={picking} aria-label="Add a criterion">
              <Icon name="add" />
            </button>
            {picking && <span className="muted small">Tap as many as you like, then Done.</span>}
          </div>
          {picking && (
            <div className="sort-picker">
              {SORT_GROUPS.map((g) => (
                <div key={g.label} className="sort-group">
                  <h4>{g.label}</h4>
                  <div className="sort-items">
                    {g.items.map((it) => (
                      <button key={it.key} className={`chip ${chosen.has(it.key) ? 'on' : ''}`} disabled={chosen.has(it.key)} onClick={() => add(it.key)}>
                        {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="menu-row">
                <button onClick={() => setPicking(false)}>Done</button>
              </div>
            </div>
          )}
        </section>

        <div className="menu-row">
          <button
            className="primary"
            disabled={sortCriteria.length === 0}
            onClick={() => {
              applySort()
              onClose()
            }}
          >
            Apply
          </button>
        </div>
      </aside>
    </div>
  )
}
