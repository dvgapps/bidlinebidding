import { useState } from 'react'
import { getSyncConfig } from '../lib/sync'
import { useOnline } from '../lib/useOnline'
import { MAX_VACATION, useStore } from '../store'
import { BidPackagesSection } from './BidPackagesSection'
import { Collapsible } from './Collapsible'
import { CreditsSection } from './CreditsSection'
import { NetIcon } from './NetIcon'
import { RangeList } from './RangeList'

/** Vacation and carry-in entry work before a package exists, so their pickers span a wide range of dates. */
const MIN = '2025-01-01'
const MAX = '2031-12-31'

const count = (n: number, one: string, many: string) => (n === 0 ? 'none' : `${n} ${n === 1 ? one : many}`)

/** Preferences: one rolled-up cell per topic (tap a title to open it); the last open or closed state is remembered. */
export function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const {
    bundle, desired, addRange, updateRange, removeRange, showDesired, setShowDesired,
    vacation, addVacation, updateVacation, removeVacation, showVacation, setShowVacation,
    carry, carryAwarded, addCarry, updateCarry, removeCarry, deriveCarry,
    timeFmt, setTimeFmt, sync, syncSignIn, syncSignOut, syncNow,
  } = useStore()
  const online = useOnline()
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

        <BidPackagesSection />

        <Collapsible
          id="desired"
          title="Desired dates off"
          summary={count(desired.length, 'range', 'ranges')}
          action={(expand) => (
            <button
              className="primary"
              onClick={() => {
                addRange()
                expand()
              }}
              disabled={!bundle}
              aria-label="Add a desired dates off range"
            >
              + Add
            </button>
          )}
        >
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
        </Collapsible>

        <Collapsible
          id="vacation"
          title="Vacation dates"
          summary={count(vacation.length, 'range', 'ranges')}
          action={(expand) => (
            <button
              className="primary"
              onClick={() => {
                addVacation()
                expand()
              }}
              disabled={full}
              aria-label="Add a vacation range"
            >
              + Add
            </button>
          )}
        >
          <p className="muted">
            Up to {MAX_VACATION} ranges (current contract). When a bid package is loaded, these days are shaded green over every line.
            Slide a range to the left to delete it.
          </p>
          {full && <p className="muted small">The maximum of {MAX_VACATION} vacation ranges is entered.</p>}
          {vacation.length === 0 && <p className="muted empty-note">No vacation entered yet. Tap + to add a range.</p>}
          <RangeList ranges={vacation} min={MIN} max={MAX} onUpdate={updateVacation} onRemove={removeVacation} />
          <label className="toggle">
            <input type="checkbox" checked={showVacation} onChange={(e) => setShowVacation(e.target.checked)} />
            <span>Show vacation shading on the lines (turns back on whenever a package is uploaded)</span>
          </label>
        </Collapsible>

        <Collapsible
          id="carry"
          title="Carry-in trips"
          summary={count(carry.length, 'range', 'ranges')}
          action={(expand) => (
            <button
              className="primary"
              onClick={() => {
                addCarry()
                expand()
              }}
              disabled={!bundle}
              aria-label="Add a carry-in date range"
            >
              + Add
            </button>
          )}
        >
          <p className="muted">
            Trips from the previous bid period that are still running when this one starts show in orange on every line, and a line that
            has duty on those dates gets a conflict box. They are taken from the line you were awarded in the previous bid (enter it under
            Bid packages), or you can enter the line here or the dates by hand.
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
        </Collapsible>

        <Collapsible id="format" title="Credit format" summary={timeFmt === 'decimal' ? '75.0' : '75:00'}>
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
        </Collapsible>

        <Collapsible id="sync" title="Sync (optional)" summary={sync.configured ? 'signed in' : 'not signed in'}>
          <p className="muted">
            Everything is saved on this iPad first. If you set up the Cloudflare Worker, your worksheets, desired dates and vacation are also
            kept on the server so they survive a cleared Safari and can be restored on another device. Bid packages are never uploaded.
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
                  <NetIcon busy={sync.status === 'syncing'} />
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
                <NetIcon busy={sync.status === 'syncing'} />
                Sign in
              </button>
            </form>
          )}
          {sync.message && (
            <p className="error small" role="alert">
              {sync.message}
            </p>
          )}
        </Collapsible>

        <Collapsible id="about" title="About" summary={`Version ${__APP_BUILD__.sha}`}>
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
        </Collapsible>

        <CreditsSection />
      </aside>
    </div>
  )
}
