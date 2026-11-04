import { useRef, useState } from 'react'
import { exportText, validateExport } from '../lib/rank'
import { useStore } from '../store'

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { bundle, lists, desired, filters, restore } = useStore()
  const text = exportText(lists.bidding)
  const valid = validateExport(lists.bidding, new Set(bundle!.lines.map((l) => l.number)))
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const bid = bundle!.bidPeriod.id

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setMsg('Copied to the clipboard.')
    } catch {
      area.current?.select()
      setMsg('Select-all done: press Copy in the iPad menu (clipboard access was blocked).')
    }
  }

  const backup = () =>
    download(
      `bidline-backup-${bid}-${filters.seat}.json`,
      JSON.stringify({ type: 'bidline-backup', version: 1, bid, seat: filters.seat, lists, desired }, null, 1),
      'application/json',
    )

  const readBackup = async (f: File | undefined) => {
    if (!f) return
    try {
      restore(JSON.parse(await f.text()))
      setMsg('Backup restored.')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="sheet export" role="dialog" aria-label="Export" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Export bid</h2>
          <button onClick={onClose}>Close</button>
        </header>
        <p className="muted">
          {lists.bidding.length} lines from the Bidding worksheet, most preferred first, separated by single spaces. Paste them into
          the company bid site.
        </p>
        {valid.ok ? (
          <p className="ok">✓ No duplicates, every line exists in package {bid}.</p>
        ) : (
          <ul className="error">
            {valid.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <textarea ref={area} readOnly value={text} rows={6} aria-label="Bid line numbers" onFocus={(e) => e.currentTarget.select()} />
        <div className="menu-row">
          <button className="primary" onClick={() => void copy()} disabled={!valid.ok}>
            Copy
          </button>
          <button onClick={() => download(`bid-${bid}-${filters.seat}.txt`, text + '\n', 'text/plain')} disabled={!valid.ok}>
            Download .txt
          </button>
        </div>
        <h3>Backup</h3>
        <p className="muted">
          Safari can evict stored data. Save a backup of your worksheets and desired dates, and restore it here if needed.
        </p>
        <div className="menu-row">
          <button onClick={backup}>Save backup</button>
          <button onClick={() => file.current?.click()}>Restore backup…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void readBackup(e.target.files?.[0])} />
        </div>
        {msg && <p role="status">{msg}</p>}
      </aside>
    </div>
  )
}
