import { useEffect, useState } from 'react'
import { linesOfGroup, SELECT_BUTTONS, type SelectKey } from '../lib/filter'
import { blocksUnion, lineAtPosition, MAX_BLOCKS, sheetLabel, SHEETS, type Sheet } from '../lib/rank'
import { useStore } from '../store'

const digits = (s: string) => s.replace(/\D/g, '')

interface BlockInput {
  from: string
  to: string
}

/**
 * "Move Lines" pane. Choose lines (a line-type button, or up to six blocks of absolute positions such as 21-44 and
 * 93-114), then place them: at the start or end of a worksheet, or before / after a line number or preference
 * position on it. The destination worksheet is picked in the same cell ("... of Bidding").
 */
export function MoveMenu({ onClose }: { onClose: () => void }) {
  const { bundle, lists, sheet, selected, setSelection, clearSelection, move } = useStore()
  const [blocks, setBlocks] = useState<BlockInput[]>([{ from: '', to: '' }])
  const [dest, setDest] = useState<Sheet>('bidding')
  const [target, setTarget] = useState('')
  const [targetBy, setTargetBy] = useState<'line' | 'pos'>('pos')
  const n = selected.size
  const list = lists[sheet]
  const destList = lists[dest]
  const sameSheet = dest === sheet

  // blocks with both boxes filled in; they select as soon as every filled block is valid
  const filled = blocks.filter((b) => b.from && b.to)
  const union = filled.length ? blocksUnion(list, filled.map((b) => ({ from: Number(b.from), to: Number(b.to) }))) : null
  useEffect(() => {
    if (union) setSelection(union)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(blocks), sheet])
  const blockHint = !filled.length
    ? ''
    : union
      ? `${union.length} line${union.length === 1 ? '' : 's'} in ${filled.length} block${filled.length === 1 ? '' : 's'}`
      : `Each block needs positions from 1 to ${list.length}, first no larger than last`

  const setBlock = (i: number, patch: Partial<BlockInput>) => setBlocks(blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)))
  const resetBlocks = () => setBlocks([{ from: '', to: '' }])

  // target on the destination worksheet: a line number or an absolute position there
  const t = Number(target)
  const targetLine = !target ? undefined : targetBy === 'line' ? (destList.includes(t) ? t : undefined) : lineAtPosition(destList, t)
  const targetOk = targetLine !== undefined && !(sameSheet && selected.has(targetLine))
  const where = sheetLabel(dest)
  const targetHint = !target
    ? ''
    : targetLine === undefined
      ? targetBy === 'line'
        ? `Line ${target} is not on ${where}`
        : destList.length
          ? `${where} has no position ${target} (1–${destList.length})`
          : `${where} is empty: use To the start or To the end`
      : sameSheet && selected.has(targetLine)
        ? 'The target is one of the selected lines'
        : targetBy === 'pos'
          ? `${where} position ${target} is line ${targetLine}`
          : `Line ${target} is at ${where} position ${destList.indexOf(targetLine) + 1}`

  const selectGroup = (g: SelectKey) => {
    const inSheet = new Set(list)
    resetBlocks()
    setSelection(linesOfGroup(bundle!.lines, g).filter((x) => inSheet.has(x)))
  }
  const run = (f: () => void) => () => {
    f()
    onClose()
  }
  const clear = () => {
    resetBlocks()
    clearSelection()
  }

  return (
    <div className="scrim" onClick={onClose}>
      <aside className="sheet dates movepane" role="dialog" aria-label="Move Lines" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Move Lines</h2>
          <button onClick={onClose}>Close</button>
        </header>

        {/* always in view: the number of selected lines is the most important thing in this pane */}
        <div className={`sel-banner ${n > 0 ? 'has' : ''}`} role="status" aria-live="polite">
          <span className="sel-count">{n}</span>
          <span className="sel-text">{n === 1 ? 'line selected' : 'lines selected'}</span>
          <button onClick={clear} disabled={n === 0}>
            Clear
          </button>
        </div>

        <section className="cell" aria-label="Select lines">
          <h3>Select lines from the {sheetLabel(sheet)} tab</h3>
          <div className="menu-row">
            {SELECT_BUTTONS.map((b) => (
              <button key={b.key} title={b.title} onClick={() => selectGroup(b.key)}>
                {b.label}
              </button>
            ))}
          </div>

          <p className="muted small">Blocks by position (up to {MAX_BLOCKS}), e.g. 21–44 and 93–114</p>
          {blocks.map((b, i) => (
            <div className="menu-row tight" key={i}>
              <input
                className="target"
                inputMode="numeric"
                placeholder="From #"
                value={b.from}
                onChange={(e) => setBlock(i, { from: digits(e.target.value) })}
                aria-label={`Block ${i + 1} first position`}
              />
              <span aria-hidden>–</span>
              <input
                className="target"
                inputMode="numeric"
                placeholder="To #"
                value={b.to}
                onChange={(e) => setBlock(i, { to: digits(e.target.value) })}
                aria-label={`Block ${i + 1} last position`}
              />
              {blocks.length > 1 && (
                <button onClick={() => setBlocks(blocks.filter((_x, k) => k !== i))} aria-label={`Remove block ${i + 1}`}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="menu-row">
            <button onClick={() => setBlocks([...blocks, { from: '', to: '' }])} disabled={blocks.length >= MAX_BLOCKS}>
              + Add block
            </button>
            {blocks.length >= MAX_BLOCKS && <span className="muted small">{MAX_BLOCKS} blocks is the maximum.</span>}
          </div>
          {blockHint && <p className={`small ${union ? 'muted' : 'error'}`}>{blockHint}</p>}
        </section>

        <section className="cell" aria-label="Place the lines">
          <h3>Place it</h3>
          <div className="menu-row">
            <button disabled={n === 0} onClick={run(() => move({ kind: 'start' }, dest))}>
              To the start
            </button>
            <button disabled={n === 0} onClick={run(() => move({ kind: 'end' }, dest))}>
              To the end
            </button>
            <button disabled={n === 0 || !targetOk} onClick={run(() => move({ kind: 'above', target: targetLine! }, dest))}>
              Move before
            </button>
            <button disabled={n === 0 || !targetOk} onClick={run(() => move({ kind: 'below', target: targetLine! }, dest))}>
              Move after
            </button>
          </div>
          <div className="menu-row">
            <div className="seg" aria-label="Target is a line number or a preference position">
              {(
                [
                  ['pos', 'Pref #'],
                  ['line', 'Line #'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={targetBy === k ? 'on' : ''} aria-pressed={targetBy === k} onClick={() => setTargetBy(k)}>
                  {l}
                </button>
              ))}
            </div>
            <input
              className="target"
              inputMode="numeric"
              placeholder={targetBy === 'line' ? 'Line #' : 'Pref #'}
              value={target}
              onChange={(e) => setTarget(digits(e.target.value))}
              aria-label="Target"
            />
          </div>
          <p className="of-text">of</p>
          <div className="seg" aria-label="Destination worksheet">
            {SHEETS.map((s) => (
              <button key={s.id} className={dest === s.id ? 'on' : ''} aria-pressed={dest === s.id} onClick={() => setDest(s.id)}>
                {s.label}
                {s.id === sheet ? ' (here)' : ''}
              </button>
            ))}
          </div>
          {targetHint && <p className={`small ${targetOk ? 'muted' : 'error'}`}>{targetHint}</p>}
        </section>
      </aside>
    </div>
  )
}
