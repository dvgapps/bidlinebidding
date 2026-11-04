import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { destFromGap } from '../lib/rank'
import { useStore } from '../store'

export interface DragState {
  ids: number[]
  gap: number
  x: number
  y: number
}

/**
 * Pointer-based drag and drop for the fixed-height virtualized rows (works with touch via the grab handle).
 * Dragging a selected line moves every selected line; the drop position is the gap between visible rows.
 */
export function useRowDrag(opts: { parent: RefObject<HTMLElement | null>; order: number[]; rowH: number; headH: number }) {
  const { parent, order, rowH, headH } = opts
  const move = useStore((s) => s.move)
  const selected = useStore((s) => s.selected)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const scrollSpeed = useRef(0)

  const gapAt = useCallback(
    (clientY: number) => {
      const el = parent.current!
      const y = clientY - el.getBoundingClientRect().top + el.scrollTop - headH
      return Math.max(0, Math.min(order.length, Math.round(y / rowH)))
    },
    [parent, order.length, rowH, headH],
  )

  // auto-scroll while dragging near the top/bottom edge
  useEffect(() => {
    if (!drag) return
    let raf = 0
    const tick = () => {
      const el = parent.current
      if (el && scrollSpeed.current && dragRef.current) {
        el.scrollTop += scrollSpeed.current
        const d = dragRef.current
        const next = { ...d, gap: gapAt(d.y) }
        dragRef.current = next
        setDrag(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drag === null, gapAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const end = (e: PointerEvent, commit: boolean) => {
    const d = dragRef.current
    dragRef.current = null
    scrollSpeed.current = 0
    setDrag(null)
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    if (!d || !commit) return
    const dest = destFromGap(order, new Set(d.ids), d.gap)
    if (dest) move(dest, undefined, d.ids)
  }

  /** Spread these props on the grab handle of the row for line `n`. */
  const handleProps = (n: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const ids = selected.has(n) ? order.filter((x) => selected.has(x)) : [n]
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      const d = { ids, gap: gapAt(e.clientY), x: e.clientX, y: e.clientY }
      dragRef.current = d
      setDrag(d)
    },
    onPointerMove: (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const rect = parent.current!.getBoundingClientRect()
      const edge = 56
      scrollSpeed.current = e.clientY < rect.top + headH + edge ? -14 : e.clientY > rect.bottom - edge ? 14 : 0
      const next = { ...d, gap: gapAt(e.clientY), x: e.clientX, y: e.clientY }
      dragRef.current = next
      setDrag(next)
    },
    onPointerUp: (e: PointerEvent) => end(e, true),
    onPointerCancel: (e: PointerEvent) => end(e, false),
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  })

  return { drag, handleProps }
}
