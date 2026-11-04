import { useRef, useState } from 'react'
import { useStore } from '../store'
import { PreferencesPanel } from './PreferencesPanel'

export function ImportScreen() {
  const importText = useStore((s) => s.importText)
  const importUrl = useStore((s) => s.importUrl)
  const error = useStore((s) => s.error)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [prefs, setPrefs] = useState(false)

  const readFile = async (f: File | undefined) => {
    if (f) await importText(await f.text())
  }

  return (
    <main className="import">
      <h1>Bidline Bidding</h1>
      <p className="muted">
        Load a bid package bundle (JSON from the ingest tool). It is saved on this device and works offline.
      </p>
      <div
        className={`drop ${drag ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void readFile(e.dataTransfer.files[0])
        }}
      >
        <button className="primary" onClick={() => input.current?.click()}>
          Choose package file…
        </button>
        <span className="muted">or drop it here</span>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void readFile(e.target.files?.[0])}
        />
      </div>
      {import.meta.env.DEV && (
        <button onClick={() => void importUrl('/data/2701.json')}>Load development sample (package 2701)</button>
      )}
      <button onClick={() => setPrefs(true)}>Preferences (vacation dates)…</button>
      {prefs && <PreferencesPanel onClose={() => setPrefs(false)} />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
