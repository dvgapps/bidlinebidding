import { useRef, useState, type PointerEvent } from 'react'

/**
 * Drag-to-reorder for a short list (touch or mouse) using a grab handle. While the handle is held, the row moves as the
 * pointer passes over the other rows. Spread `handleProps(i)` on the handle and give each row `ref={setRow(i)}`.
 */
export function useListReorder(onMove: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([])
  const from = useRef<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const end = () => {
    from.current = null
    setDragging(null)
  }

  const handleProps = (i: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      from.current = i
      setDragging(i)
    },
    onPointerMove: (e: PointerEvent) => {
      const cur = from.current
      if (cur == null) return
      const over = rows.current.findIndex((el) => {
        const r = el?.getBoundingClientRect()
        return !!r && e.clientY >= r.top && e.clientY < r.bottom
      })
      if (over >= 0 && over !== cur) {
        onMove(cur, over)
        from.current = over
        setDragging(over)
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
  })

  const setRow = (i: number) => (el: HTMLElement | null) => {
    rows.current[i] = el
  }

  return { handleProps, setRow, dragging }
}
