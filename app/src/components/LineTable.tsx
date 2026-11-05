import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Line } from '../types'
import { holdLineClass } from '../lib/ipa'
import type { SortKey } from '../lib/filter'
import type { LineMetrics } from '../lib/metrics'
import { TYPE_CLASS, TYPE_LABEL } from '../lib/labels'
import { holdLabel } from '../lib/ipa'
import { useFmt } from '../lib/useFmt'
import { useStore } from '../store'
import { useRowDrag } from './useRowDrag'
import { useResetScroll } from './useResetScroll'

const ROW_H = 42
const HEAD_H = 44

interface Col {
  key: SortKey | 'type'
  label: string
  title: string
  cls?: string
  firstDesc?: boolean
  cell: (l: Line, m: LineMetrics, f: (v: number | null | undefined) => string, dto: string) => string
}

const pct = (v: number | null) => (v == null ? '–' : `${Math.round(v * 100)}%`)

/** The Holding column lives in the left pane, like the Calendar page. */
const HOLD_COL: Col = {
  key: 'hold',
  label: 'Holding',
  title: 'IPA Snapshot: can you hold this line at your seniority? (an aid, not authority)',
  firstDesc: true,
  cell: () => '',
}

const COLS: Col[] = [
  { key: 'type', label: 'Type', title: 'Line type', cell: (l) => TYPE_LABEL[l.type] },
  {
    key: 'pay', label: 'Pay', firstDesc: true, cls: 'r',
    title: 'Credit for both PPs; a PP with no printed credit (reserve, VTO, VTOR) counts 75:00; floor 75:00 per PP',
    cell: (_l, m, f) => f(m.payMin),
  },
  { key: 'do', label: 'DO', title: 'Days off (as printed in the package)', cls: 'r', firstDesc: true, cell: (_l, m) => String(m.doPrinted) },
  { key: 'dd', label: 'DD', title: 'Duty days (as printed in the package)', cls: 'r', cell: (_l, m) => String(m.ddPrinted) },
  { key: 'tb', label: 'TB', title: 'Total block', cls: 'r', cell: (_l, m, f) => f(m.btMin) },
  {
    key: 'dto', label: 'DTO', cls: 'r', firstDesc: true,
    title: 'Share of your desired dates off that are days off on this line',
    cell: (_l, _m, _f, dto) => dto,
  },
  {
    key: 'tc', label: 'TC', cls: 'r wide', firstDesc: true,
    title: 'Trip credit PP1 / PP2 (75 when the PP has no printed credit)',
    cell: (_l, m, f) => `${f(m.tcPP[0])} / ${f(m.tcPP[1])}`,
  },
  {
    key: 'intl', label: '%INTL', cls: 'r', firstDesc: true,
    title: 'Share of flown legs to/from an international airport (Canada and Mexico are not international)',
    cell: (_l, m) => pct(m.intlPct),
  },
  { key: 'tafb', label: 'TAFB', title: 'Time away from base, all trips', cls: 'r', cell: (_l, m, f) => f(m.tafbMin) },
  { key: 'wknd', label: '%Wknd', title: 'Weekends (Sat+Sun) off', cls: 'r', firstDesc: true, cell: (_l, m) => pct(m.wkndOffPct) },
  { key: 'sat', label: '%Sat', title: 'Saturdays off', cls: 'r', firstDesc: true, cell: (_l, m) => pct(m.satOffPct) },
  { key: 'sun', label: '%Sun', title: 'Sundays off', cls: 'r', firstDesc: true, cell: (_l, m) => pct(m.sunOffPct) },
]

export function LineTable({ lines }: { lines: Line[] }) {
  const { metrics, hold, dto, lists, sheet, selected, toggleSelect, setSelection, clearSelection, selectLine, sortBy } = useStore()
  const fmt = useFmt()
  const parent = useRef<HTMLDivElement>(null)
  useResetScroll(parent)
  const head = useRef<HTMLDivElement>(null)
  // every row is as wide as the header (all columns), so the row colour runs to the end when the list is scrolled sideways
  const [rowW, setRowW] = useState<number | undefined>()
  useLayoutEffect(() => {
    const el = head.current
    if (!el) return
    const measure = () => setRowW(el.scrollWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [sortMark, setSortMark] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const rank = new Map(lists[sheet].map((n, i) => [n, i + 1]))
  const order = lines.map((l) => l.number)
  const { drag, handleProps } = useRowDrag({ parent, order, rowH: ROW_H, headH: HEAD_H })

  const v = useVirtualizer({ count: lines.length, getScrollElement: () => parent.current, estimateSize: () => ROW_H, overscan: 12 })

  const clickHeader = (c: Col) => {
    if (c.key === 'type') return
    const dir = sortMark?.key === c.key ? (sortMark.dir === 'asc' ? 'desc' : 'asc') : c.firstDesc ? 'desc' : 'asc'
    setSortMark({ key: c.key, dir })
    sortBy(c.key, dir)
  }
  const allSelected = lines.length > 0 && lines.every((l) => selected.has(l.number))

  return (
    <div className="table-wrap" ref={parent}>
      <div className="thead" ref={head} style={{ height: HEAD_H }}>
        <div className="lead sticky">
          <span className="th-handle" />
          <label className="th-check" title="Select all shown lines">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => (allSelected ? clearSelection() : setSelection(order))}
              aria-label="Select all shown lines"
            />
          </label>
          <span className="th-rank" title="Position in this worksheet">#</span>
          <button className="th num" title="Sort by line number" onClick={() => clickHeader({ key: 'number', label: 'Line', title: '', cell: () => '' })}>
            Line{sortMark?.key === 'number' && <span aria-hidden> {sortMark.dir === 'asc' ? '▲' : '▼'}</span>}
          </button>
          <button className="th hold-th" title={HOLD_COL.title} onClick={() => clickHeader(HOLD_COL)}>
            {HOLD_COL.label}
            {sortMark?.key === 'hold' && <span aria-hidden> {sortMark.dir === 'asc' ? '▲' : '▼'}</span>}
          </button>
        </div>
        {COLS.map((c) => (
          <button
            key={c.key}
            className={`th ${c.cls ?? ''}`}
            title={c.title}
            onClick={() => clickHeader(c)}
          >
            {c.label}
            {sortMark?.key === c.key && <span aria-hidden> {sortMark.dir === 'asc' ? '▲' : '▼'}</span>}
          </button>
        ))}
      </div>
      <div style={{ height: v.getTotalSize(), position: 'relative', width: rowW }}>
        {v.getVirtualItems().map((vi) => {
          const l = lines[vi.index]
          const m = metrics.get(l.number)!
          const dd = dto.get(l.number)
          const dtoText = dd?.pct == null ? '–' : pct(dd.pct)
          const dragging = drag?.ids.includes(l.number)
          return (
            <div
              key={l.number}
              className={`tr ${vi.index % 2 ? 'alt' : ''} ${selected.has(l.number) ? 'sel' : ''} ${dragging ? 'dragging' : ''} ${hold.get(l.number)?.status === 'unavailable' ? 'unavail' : ''} ${holdLineClass(hold.get(l.number))}`}
              style={{ transform: `translateY(${vi.start}px)`, height: vi.size, width: rowW }}
              role="button"
              tabIndex={0}
              onClick={() => selectLine(l.number)}
              onKeyDown={(e) => e.key === 'Enter' && selectLine(l.number)}
            >
              <div className="lead sticky">
                <span
                  className="handle"
                  role="button"
                  aria-label={`Drag line ${l.number}`}
                  {...handleProps(l.number)}
                >
                  ⠿
                </span>
                <label className="check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(l.number)}
                    onChange={() => toggleSelect(l.number)}
                    aria-label={`Select line ${l.number}`}
                  />
                </label>
                <span className="rank">{rank.get(l.number)}</span>
                <span className="td num">
                  <span className="numtxt">{l.number}</span>
                </span>
                <span className="td hold">
                  <span className={`hold-${hold.get(l.number)?.status ?? 'none'}`}>{holdLabel(hold.get(l.number))}</span>
                </span>
              </div>
              {COLS.map((c) => (
                <span key={c.key} className={`td ${c.cls ?? ''}`} title={c.key === 'dto' && dd?.total ? `${dd.off} of ${dd.total} desired dates off` : undefined}>
                  {c.key === 'type' ? (
                    <span className={`badge k-${TYPE_CLASS[l.type]}`}>{c.cell(l, m, fmt, dtoText)}</span>
                  ) : (
                    c.cell(l, m, fmt, dtoText)
                  )}
                </span>
              ))}
            </div>
          )
        })}
        {drag && (
          <div className="drop-line" style={{ transform: `translateY(${drag.gap * ROW_H}px)` }} aria-hidden />
        )}
      </div>
      {drag && (
        <div className="ghost" style={{ left: drag.x + 12, top: drag.y - 16 }} aria-hidden>
          {drag.ids.length === 1 ? `Line ${drag.ids[0]}` : `${drag.ids.length} lines`}
        </div>
      )}
    </div>
  )
}
