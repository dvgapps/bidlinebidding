import { useRef, useState } from 'react'
import { exportText, validateExport } from '../lib/rank'
import type { UnlistedMode } from '../lib/ranking'
import { useStore } from '../store'

/**
 * Save a text file. On the iPad the share sheet is used (no page is opened); elsewhere a normal download. The blob URL
 * lives for a few minutes: revoking it at once makes iOS fail to open it ("WebKitBlobResource error 1").
 */
async function download(name: string, text: string, type: string) {
  try {
    const file = new File([text], name, { type })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] })
      return
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return // the user closed the share sheet
  }
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000)
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { bundle, lists, desired, filters, restore, importRanking, notify } = useStore()
  const [pasted, setPasted] = useState('')
  const [mode, setMode] = useState<UnlistedMode>('end')
  const preview = pasted.trim() ? importRanking(pasted, mode, false) : null
  const text = exportText(lists.bidding)
  const valid = validateExport(lists.bidding, new Set(bundle!.lines.map((l) => l.number)))
  const area = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const bid = bundle!.bidPeriod.id

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      notify(`Copied ${lists.bidding.length} line numbers to the clipboard`)
    } catch {
      area.current?.select()
      setMsg('Select-all done: press Copy in the iPad menu (clipboard access was blocked).')
    }
  }

  const backup = () =>
    void download(
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
        <section className="cell" aria-label="Export the bid">
        <h3>Line numbers</h3>
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
          <button onClick={() => void download(`bid-${bid}-${filters.seat}.txt`, text + '\n', 'text/plain')} disabled={!valid.ok}>
            Download .txt
          </button>
        </div>
        </section>

        <section className="cell" aria-label="Import a ranking">
        <h3>Import a ranking</h3>
        <p className="muted">
          Paste a list of line numbers (for example your BidPro ranking, separated by spaces) to set the Bidding order. You can undo it
          afterwards with Undo in the toolbar.
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          placeholder="673 522 812 547 …"
          aria-label="Line numbers to import"
        />
        <div className="menu-row">
          <span className="muted small">Lines on Bidding that are not in your list:</span>
          <div className="seg" aria-label="What to do with unlisted lines">
            {(
              [
                ['end', 'Keep at the end'],
                ['excluded', 'Move to Excluded'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {preview && (
          <div className="small">
            <p className={preview.matched.length ? 'ok' : 'error'}>
              {preview.matched.length} line{preview.matched.length === 1 ? '' : 's'} will be ranked
              {preview.unlisted.length
                ? `; ${preview.unlisted.length} not in your list will ${mode === 'end' ? 'follow them' : 'move to Excluded'}`
                : ''}
              .
            </p>
            {preview.unknown.length > 0 && <p className="error">Not in this package: {preview.unknown.join(' ')}</p>}
            {preview.ineligible.length > 0 && <p className="error">Not available to your seat: {preview.ineligible.join(' ')}</p>}
            {preview.duplicates.length > 0 && <p className="muted">Repeated (the first one counts): {preview.duplicates.join(' ')}</p>}
          </div>
        )}
        <div className="menu-row">
          <button
            className="primary"
            disabled={!preview || preview.matched.length === 0}
            onClick={() => {
              importRanking(pasted, mode, true)
              setMsg('Ranking imported to the Bidding worksheet. Use Undo in the toolbar to revert it.')
              setPasted('')
            }}
          >
            Apply to Bidding
          </button>
        </div>

        </section>

        <section className="cell" aria-label="Backup">
        <h3>Backup</h3>
        <p className="muted">
          Safari can evict stored data. Save a backup of your worksheets and desired dates, and restore it here if needed.
        </p>
        <div className="menu-row">
          <button onClick={backup}>Save backup</button>
          <button onClick={() => file.current?.click()}>Restore backup…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void readBackup(e.target.files?.[0])} />
        </div>
        </section>
        {msg && <p role="status">{msg}</p>}
      </aside>
    </div>
  )
}
