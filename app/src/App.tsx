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
