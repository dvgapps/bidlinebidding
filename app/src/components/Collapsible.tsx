import { useState, type ReactNode } from 'react'

const KEY = 'bidline-prefs-open-v1'

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/** Whether a Preferences section is expanded; remembered between visits (this device only). */
function useSectionOpen(id: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => readOpen()[id] ?? false)
  const set = (v: boolean) => {
    setOpen(v)
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [id]: v }))
    } catch {
      /* storage unavailable: it just starts collapsed next time */
    }
  }
  return [open, set]
}

/**
 * A shaded cell that is rolled up to its title (with a one-line summary) until tapped. `action` is a button that sits beside the
 * title (for example "+ Add"); it receives `expand` so it can open the section.
 */
export function Collapsible({
  id,
  title,
  summary,
  action,
  children,
}: {
  id: string
  title: string
  summary?: ReactNode
  action?: (expand: () => void) => ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useSectionOpen(id)
  return (
    <section className="cell collapsible" aria-label={title}>
      <div className="coll-head">
        <h3 className="coll-h">
          <button type="button" className="coll-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className={`chevron ${open ? 'chevron-open' : ''}`} aria-hidden="true" />
            <span className="coll-title">{title}</span>
            {summary != null && <span className="coll-summary">{summary}</span>}
          </button>
        </h3>
        {action?.(() => setOpen(true))}
      </div>
      {open && <div className="coll-body">{children}</div>}
    </section>
  )
}
