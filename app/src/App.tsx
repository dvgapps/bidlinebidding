import { useEffect, useMemo } from 'react'
import { CalendarView } from './components/CalendarView'
import { ImportScreen } from './components/ImportScreen'
import { LineSheet } from './components/LineSheet'
import { LineTable } from './components/LineTable'
import { SheetTabs } from './components/SheetTabs'
import { Toast } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import { TripSheet } from './components/TripSheet'
import { lineVisible } from './lib/filter'
import { useStore } from './store'

export default function App() {
  const { status, bundle, lists, sheet, filters, view, hold, init } = useStore()
  useEffect(() => {
    void init()
  }, [init])

  // Development only: open the app with ?demo=hold to fill the Hold column with made-up statuses (no IPA / server needed).
  useEffect(() => {
    if (!import.meta.env.DEV || !bundle || !new URLSearchParams(location.search).has('demo')) return
    const rows = bundle.lines
      .filter((l) => l.eligible.captain)
      .map((l, i) => ({
        choice: i + 1,
        line: l.number,
        status: (i === 4 ? 'current' : i % 3 === 0 ? 'unavailable' : i % 3 === 1 ? 'available' : null) as 'current' | 'unavailable' | 'available' | null,
      }))
      .filter((r): r is { choice: number; line: number; status: 'current' | 'unavailable' | 'available' } => r.status !== null)
    useStore.setState({ hold: new Map(rows.map((r) => [r.line, r])) })
  }, [bundle])

  const byNumber = useMemo(() => new Map((bundle?.lines ?? []).map((l) => [l.number, l])), [bundle])
  const lines = useMemo(
    () => lists[sheet].map((n) => byNumber.get(n)!).filter((l) => l && lineVisible(l, filters, hold)),
    [lists, sheet, filters, byNumber, hold],
  )

  if (status === 'loading') return <main className="import muted">Loading…</main>
  if (status === 'empty' || !bundle) return <ImportScreen />

  return (
    <div className="app">
      <TopBar shown={lines.length} total={lists[sheet].length} />
      <Toolbar />
      {lines.length === 0 ? (
        <p className="empty muted">{lists[sheet].length === 0 ? 'This worksheet is empty.' : 'No lines match the current filters.'}</p>
      ) : view === 'table' ? (
        <LineTable lines={lines} />
      ) : (
        <CalendarView lines={lines} />
      )}
      <SheetTabs />
      <LineSheet />
      <TripSheet />
      <Toast />
    </div>
  )
}
