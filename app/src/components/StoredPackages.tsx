import { useEffect, useState } from 'react'
import type { StoredInfo } from '../lib/db'
import { TYPE_LABEL } from '../lib/labels'
import { useStore } from '../store'

const digits = (s: string) => s.replace(/\D/g, '')

/** The awarded-line box. Keyed by the stored award, so a value that arrives through sync replaces what is shown. */
function AwardField({ info, award }: { info: StoredInfo; award: number | null }) {
  const setAward = useStore((s) => s.setAward)
  const [text, setText] = useState(award == null ? '' : String(award))
  const [error, setError] = useState<string | null>(null)
  
  const type = award != null ? info.lineTypes[award] : undefined
  const commit = () => {
    const n = Number(text)
    if (text === '') {
      setError(null)
      if (award != null) void setAward(info.id, null)
    } else if (info.lineTypes[n]) {
      setError(null)
      if (n !== award) void setAward(info.id, n)
    } else setError(`Line ${n} is not in bid ${info.id}`)
  }

  return (
    <>
        <label className="stored-award">
          <span>Awarded line</span>
          <input
            className="target"
            inputMode="numeric"
            placeholder="none"
            value={text}
            onChange={(e) => setText(digits(e.target.value))}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={`Line awarded in bid ${info.id}`}
          />
          {type && <span className="muted small">{TYPE_LABEL[type]}</span>}
        </label>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
    </>
  )
}

function PackageRow({ info, award, isOpen }: { info: StoredInfo; award: number | null; isOpen: boolean }) {
  const openPackage = useStore((s) => s.openPackage)
  const deletePackage = useStore((s) => s.deletePackage)
  const signedIn = useStore((s) => s.sync.configured)
  return (
    <li className={`stored-pkg ${isOpen ? 'is-open' : ''}`}>
      <div className="stored-head">
        <span>
          <strong>Bid {info.id}</strong>
          {isOpen && <span className="badge new"> open</span>}
          <br />
          <span className="muted small">
            {info.lines} lines, {info.trips} trips, generated {info.generated}
          </span>
        </span>
        <span className="stored-actions">
          <button className="primary" onClick={() => void openPackage(info.id)} disabled={isOpen}>
            Open
          </button>
          <button
            className="warn"
            onClick={() => {
              const where = signedIn ? ' It is removed from your server too.' : ''
              if (window.confirm(`Delete bid ${info.id} from this iPad? Its sort orders, desired dates, carry-in and awarded line are deleted with it.${where}`)) void deletePackage(info.id)
            }}
          >
            Delete
          </button>
        </span>
      </div>
      <AwardField key={String(award)} info={info} award={award} />
    </li>
  )
}

/** Preferences > Bid packages: every package stored on this iPad, with the line you were awarded; open one or delete it. */
export function StoredPackages() {
  const packages = useStore((s) => s.packages)
  const awards = useStore((s) => s.awards)
  const openId = useStore((s) => s.bundle?.bidPeriod.id)
  const refreshPackages = useStore((s) => s.refreshPackages)
  useEffect(() => void refreshPackages(), [refreshPackages])

  return (
    <section className="cell" aria-label="Bid packages">
      <h3>Bid packages</h3>
      <p className="muted">
        Every package you load is kept on this iPad. Open one to see it with its own sort order and dates; each package keeps its own.
        Enter the line you were awarded: the next bid period's carry-in follows from it.
      </p>
      {packages.length === 0 ? (
        <p className="muted small">No package is stored yet.</p>
      ) : (
        <ul className="pkgs stored">
          {packages.map((p) => (
            <PackageRow key={p.id} info={p} award={awards[p.id] ?? null} isOpen={p.id === openId} />
          ))}
        </ul>
      )}
    </section>
  )
}
