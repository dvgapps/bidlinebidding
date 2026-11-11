import { useRef } from 'react'
import { useOnline } from '../lib/useOnline'
import { useStore } from '../store'
import { Collapsible } from './Collapsible'
import { NetIcon } from './NetIcon'
import { StoredPackages } from './StoredPackages'

/**
 * Preferences > Bid packages, in the order you use it: the packages on this iPad (open one, enter the line you were awarded, delete
 * one), load a package from a file, and download one you published from your PC to your server.
 */
export function BidPackagesSection() {
  const { bundle, packages, importText, importUrl, error, server, newPackage, sync, refreshServerPackages, loadServerPackage } = useStore()
  const online = useOnline()
  const fileInput = useRef<HTMLInputElement>(null)
  const open = bundle ? `Bid ${bundle.bidPeriod.id} open` : 'none open'

  return (
    <Collapsible id="packages" title="Bid packages" summary={`${open} · ${packages.length} stored`}>
      <h4>On this iPad</h4>
      <p className="muted">
        Every package you load is kept here. Open one to see it with its own sort order and dates; each package keeps its own. Enter the
        line you were awarded: the next bid period's carry-in follows from it.
      </p>
      <StoredPackages />

      <h4>Load a package file</h4>
      <p className="muted small">A package loaded again replaces the stored copy of that bid (its worksheets are kept).</p>
      <div className="menu-row">
        <button onClick={() => fileInput.current?.click()}>Load package file…</button>
        {import.meta.env.DEV && <button onClick={() => void importUrl('/data/2701.json')}>Reload development sample</button>}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) await importText(await f.text())
            e.target.value = ''
          }}
        />
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}

      <h4>On your server</h4>
      {!sync.configured ? (
        <p className="muted small">Sign in under Sync below to download packages you published from your PC.</p>
      ) : (
        <>
          <div className="menu-row">
            <button className="with-icon" onClick={() => void refreshServerPackages()} disabled={server.status === 'loading' || !online}>
              <NetIcon busy={server.status === 'loading'} />
              {server.status === 'loading' ? 'Checking…' : 'Check server'}
            </button>
          </div>
          {server.message && <p className={`small ${server.status === 'error' ? 'error' : 'muted'}`}>{server.message}</p>}
          <ul className="pkgs">
            {server.packages
              .slice()
              .sort((a, b) => (a.id < b.id ? 1 : -1))
              .map((p) => (
                <li key={p.id}>
                  <span>
                    <strong>Bid {p.id}</strong>
                    {newPackage?.id === p.id && <span className="badge new"> new</span>}
                    <br />
                    <span className="muted small">
                      {p.lines} lines, {p.trips} trips, {(p.bytes / 1e6).toFixed(1)} MB, generated {p.generated}
                    </span>
                  </span>
                  <button
                    className={`with-icon ${newPackage?.id === p.id ? 'primary' : ''}`}
                    onClick={() => void loadServerPackage(p.id)}
                    disabled={server.status === 'loading' || !online}
                  >
                    <NetIcon busy={server.status === 'loading'} />
                    Load
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </Collapsible>
  )
}
