import { useEffect, useState } from 'react'
import { linesOfGroup, type TypeGroup } from '../lib/filter'
import { blocksUnion, lineAtPosition, MAX_BLOCKS, SHEETS, type Sheet } from '../lib/rank'
import { useStore } from '../store'

const digits = (s: string) => s.replace(/\D/g, '')

interface BlockInput {
  from: string
  to: string
}

/**
 * "Move Lines" menu. Choose lines (checkboxes, all VTO / VTOR / RSV, or up to five blocks of absolute
 * positions such as 21-44 and 93-114), choose the destination worksheet, then move them to its start,
 * its end, or before / after a line number or preference position on that worksheet.
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
  const where = SHEETS.find((s) => s.id === dest)!.label
  const targetHint = !target
    ? ''
    : targetLine === undefined
      ? targetBy === 'line'
        ? `Line ${target} is not on ${where}`
        : destList.length
          ? `${where} has no position ${target} (1–${destList.length})`
          : `${where} is empty: use Move to start or end`
      : sameSheet && selected.has(targetLine)
        ? 'The target is one of the selected lines'
        : targetBy === 'pos'
          ? `${where} position ${target} is line ${targetLine}`
          : `Line ${target} is at ${where} position ${destList.indexOf(targetLine) + 1}`

  const selectGroup = (g: TypeGroup) => {
    const inSheet = new Set(list)
    resetBlocks()
    setSelection(linesOfGroup(bundle!.lines, g).filter((x) => inSheet.has(x)))
  }
  const run = (f: () => void) => () => {
    f()
    onClose()
  }

  return (
    <div className="scrim menu-scrim" onClick={onClose}>
      <div className="menu" role="dialog" aria-label="Move Lines" onClick={(e) => e.stopPropagation()}>
        <h2>Move Lines</h2>

        <p className="muted">1. Select lines from {SHEETS.find((s) => s.id === sheet)!.label}</p>
        <div className="menu-row">
          <button onClick={() => selectGroup('vto')}>All VTO</button>
          <button onClick={() => selectGroup('vtor')}>All VTOR</button>
          <button onClick={() => selectGroup('reserve')}>All RSV</button>
          <button
            onClick={() => {
              resetBlocks()
              clearSelection()
            }}
            disabled={n === 0}
          >
            Clear
          </button>
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
          {blocks.length >= MAX_BLOCKS && <span className="muted small">Five blocks is the maximum.</span>}
        </div>
        {blockHint && <p className={`small ${union ? 'muted' : 'error'}`}>{blockHint}</p>}
        <p>
          <strong>{n}</strong> selected
        </p>

        <div className={`menu-actions ${n === 0 ? 'disabled' : ''}`}>
          <p className="muted">2. Move to worksheet</p>
          <div className="seg" aria-label="Destination worksheet">
            {SHEETS.map((s) => (
              <button key={s.id} className={dest === s.id ? 'on' : ''} aria-pressed={dest === s.id} onClick={() => setDest(s.id)}>
                {s.label}
                {s.id === sheet ? ' (here)' : ''}
              </button>
            ))}
          </div>

          <p className="muted">3. Place it</p>
          <div className="menu-row">
            <button disabled={n === 0} onClick={run(() => move({ kind: 'start' }, dest))}>
              To start
            </button>
            <button disabled={n === 0} onClick={run(() => move({ kind: 'end' }, dest))}>
              To end
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
            <button disabled={n === 0 || !targetOk} onClick={run(() => move({ kind: 'above', target: targetLine! }, dest))}>
              Move before
            </button>
            <button disabled={n === 0 || !targetOk} onClick={run(() => move({ kind: 'below', target: targetLine! }, dest))}>
              Move after
            </button>
          </div>
          {targetHint && <p className={`small ${targetOk ? 'muted' : 'error'}`}>{targetHint}</p>}
          {dest !== 'excluded' && sheet !== 'excluded' ? (
            <div className="menu-row">
              <button className="warn" disabled={n === 0} onClick={run(() => move({ kind: 'end' }, 'excluded'))}>
                Move to Excluded
              </button>
            </div>
          ) : null}
        </div>

        <div className="menu-row end">
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
