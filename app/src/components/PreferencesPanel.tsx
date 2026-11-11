import { useRef, useState } from 'react'
import { getSyncConfig } from '../lib/sync'
import { useOnline } from '../lib/useOnline'
import { MAX_VACATION, useStore } from '../store'
import { Icon } from './Icon'
import { RangeList } from './RangeList'

/** Vacation and carry-in entry work before a package exists, so their pickers span a wide range of dates. */
const MIN = '2025-01-01'
const MAX = '2031-12-31'

export function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const {
    bundle, desired, addRange, updateRange, removeRange, showDesired, setShowDesired,
    vacation, addVacation, updateVacation, removeVacation, showVacation, setShowVacation,
    carry, carryAwarded, addCarry, updateCarry, removeCarry, deriveCarry,
    timeFmt, setTimeFmt, sync, syncSignIn, syncSignOut, syncNow, importText, importUrl, error, server, newPackage, refreshServerPackages, loadServerPackage,
  } = useStore()
  const online = useOnline()
  const offlineIcon = !online && <Icon name="cloud_off" size={18} />
  const fileInput = useRef<HTMLInputElement>(null)
  const [awarded, setAwarded] = useState(carryAwarded ? String(carryAwarded) : '')
  const [carryMsg, setCarryMsg] = useState<string | null>(null)
  const [url, setUrl] = useState(getSyncConfig()?.url ?? '')
  const [pass, setPass] = useState('')
  const full = vacation.length >= MAX_VACATION
  const days = bundle?.lines[0].days

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="sheet dates" role="dialog" aria-label="Preferences" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Preferences</h2>
          <button onClick={onClose}>Close</button>
        </header>

        <section className="cell" aria-label="Desired dates off">
          <div className="pref-head">
            <h3>Desired dates off</h3>
            <button className="primary" onClick={addRange} disabled={!bundle} aria-label="Add a desired dates off range">
              + Add
            </button>
          </div>
          <p className="muted">
            Pick the days you want off. Lines are scored by how many of these dates they leave free (DTO). Slide a range to the left to
            delete it.
          </p>
          {!bundle ? (
            <p className="muted small">Load the bid package first (the dates are limited to the bid period).</p>
          ) : (
            <>
              {desired.length === 0 && <p className="muted empty-note">No dates yet. Tap + to add a range.</p>}
              <RangeList
                ranges={desired}
                min={days![0].date}
                max={days![days!.length - 1].date}
                onUpdate={updateRange}
                onRemove={removeRange}
              />
              <label className="toggle">
                <input type="checkbox" checked={showDesired} onChange={(e) => setShowDesired(e.target.checked)} />
                <span>Show desired dates off on the lines (turns back on whenever a package is uploaded)</span>
              </label>
            </>
          )}
        </section>

        <section className="cell" aria-label="Vacation dates">
          <div className="pref-head">
            <h3>Vacation dates</h3>
            <button className="primary" onClick={addVacation} disabled={full} aria-label="Add a vacation range">
              + Add
            </button>
          </div>
          <p className="muted">
            Up to {MAX_VACATION} ranges (current contract). When a bid package is loaded, these days are shaded green over every
            line. Slide a range to the left to delete it.
          </p>
          {full && <p className="muted small">The maximum of {MAX_VACATION} vacation ranges is entered.</p>}
          {vacation.length === 0 && <p className="muted empty-note">No vacation entered yet. Tap + to add a range.</p>}
          <RangeList ranges={vacation} min={MIN} max={MAX} onUpdate={updateVacation} onRemove={removeVacation} />
          <label className="toggle">
            <input type="checkbox" checked={showVacation} onChange={(e) => setShowVacation(e.target.checked)} />
            <span>Show vacation shading on the lines (turns back on whenever a package is uploaded)</span>
          </label>
        </section>

        <section className="cell" aria-label="Carry-in trips">
          <div className="pref-head">
            <h3>Carry-in trips</h3>
            <button className="primary" onClick={addCarry} disabled={!bundle} aria-label="Add a carry-in date range">
              + Add
            </button>
          </div>
          <p className="muted">
            Trips from the previous bid period that are still running when this one starts show in orange on every line, and a line
            that has duty on those dates gets a conflict box. After the previous bid closes, enter the line you were awarded and the
            dates are taken from it; or enter them by hand.
          </p>
          {!bundle ? (
            <p className="muted small">Load this period's bid package first.</p>
          ) : (
            <>
              <div className="menu-row">
                <input
                  className="target"
                  inputMode="numeric"
                  placeholder="Awarded line"
                  value={awarded}
                  onChange={(e) => setAwarded(e.target.value.replace(/\D/g, ''))}
                  aria-label="Line awarded in the previous bid period"
                />
                <button disabled={!awarded} onClick={() => void deriveCarry(Number(awarded)).then(setCarryMsg)}>
                  Use this line
                </button>
              </div>
              {carryMsg && <p className="muted small">{carryMsg}</p>}
              {carry.length === 0 && <p className="muted empty-note">No carry-in dates entered.</p>}
              <RangeList ranges={carry} min={MIN} max={MAX} onUpdate={updateCarry} onRemove={removeCarry} />
            </>
          )}
        </section>

        <section className="cell" aria-label="Credit format">
          <h3>Credit format</h3>
          <p className="muted">How pay, block and TAFB hours are shown on the lines.</p>
          <div className="seg wide" role="group" aria-label="Credit format">
            {(
              [
                ['decimal', '75.0'],
                ['hm', '75:00'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={timeFmt === k ? 'on' : ''} aria-pressed={timeFmt === k} onClick={() => setTimeFmt(k)}>
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="cell" aria-label="Bid package">
          <h3>Bid package</h3>
          <p className="muted">
            {bundle ? (
              <>
                Loaded: bid <strong>{bundle.bidPeriod.id}</strong> ({bundle.bidPeriod.domicile} {bundle.bidPeriod.fleet}), generated{' '}
                {bundle.bidPeriod.generated}. {bundle.lines.length} lines, {bundle.trips.length} trips.
              </>
            ) : (
              'No package loaded.'
            )}{' '}
            The package is stored on this device. Load a newer file to replace it (your worksheets for that bid are kept).
          </p>
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
          {error && <p className="error small" role="alert">{error}</p>}

          <h4>On your server</h4>
          {!sync.configured ? (
            <p className="muted small">Sign in under Sync below to download packages you published from your PC.</p>
          ) : (
            <>
              <div className="menu-row">
                <button className="with-icon" onClick={() => void refreshServerPackages()} disabled={server.status === 'loading' || !online}>
                  {offlineIcon}
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
                        className={newPackage?.id === p.id ? 'primary' : ''}
                        onClick={() => void loadServerPackage(p.id)}
                        disabled={server.status === 'loading' || !online}
                      >
                        {offlineIcon}
                        Load
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </section>

        <section className="cell" aria-label="About">
          <h3>About</h3>
          <p>
            <strong>BidlineBidding</strong> Version {__APP_BUILD__.sha}, {__APP_BUILD__.time}.
          </p>
          <p className="muted">
            If the installed app looks older than the latest update, tap Update now: it clears the app's saved files and reloads (your
            worksheets and package stay).
          </p>
          <div className="menu-row">
            <button
              onClick={async () => {
                try {
                  const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
                  await Promise.all(regs.map((r) => r.unregister()))
                  const keys = (await caches?.keys?.()) ?? []
                  await Promise.all(keys.map((k) => caches.delete(k)))
                } finally {
                  location.reload()
                }
              }}
            >
              Update now
            </button>
          </div>
          <p className="about-gap">Developed by DVGApps and Claude</p>
          <p className="about-gap">Coded by Claude, an AI assistant made by Anthropic.</p>
        </section>

        <section className="cell" aria-label="Sync">
          <h3>Sync (optional)</h3>
          <p className="muted">
            Everything is saved on this iPad first. If you set up the Cloudflare Worker, your worksheets, desired dates and vacation are
            also kept on the server so they survive a cleared Safari and can be restored on another device. Bid packages are never
            uploaded.
          </p>
          {sync.configured ? (
            <>
              <p>
                Signed in to <code>{getSyncConfig()?.url}</code>
                <br />
                <span className="muted small">
                  {sync.status === 'syncing' ? 'Syncing…' : sync.last ? `Last synced ${new Date(sync.last).toLocaleTimeString()}` : 'Not synced yet'}
                </span>
              </p>
              <div className="menu-row">
                <button className="with-icon" onClick={() => void syncNow()} disabled={sync.status === 'syncing' || !online}>
                  {offlineIcon}
                  Sync now
                </button>
                <button onClick={syncSignOut}>Sign out</button>
              </div>
            </>
          ) : (
            <form
              className="sync-form"
              onSubmit={(e) => {
                e.preventDefault()
                void syncSignIn(url, pass).then(() => setPass(''))
              }}
            >
              <input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="https://bidline-api.your-name.workers.dev"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="Server address"
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="Passphrase"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                aria-label="Passphrase"
              />
              <button className="primary with-icon" type="submit" disabled={!url || !pass || sync.status === 'syncing' || !online}>
                {offlineIcon}
                Sign in
              </button>
            </form>
          )}
          {sync.message && (
            <p className="error small" role="alert">
              {sync.message}
            </p>
          )}
        </section>
      </aside>
    </div>
  )
}
