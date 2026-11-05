import { useEffect, type RefObject } from 'react'
import { useStore } from '../store'

/**
 * Snap the list back to its first row whenever the set of lines changes (a filter, the search text, the seat or the worksheet).
 * Without it, a long scroll position can leave the few remaining rows far above the visible area, so the list looks empty.
 */
export function useResetScroll(parent: RefObject<HTMLElement | null>) {
  const sheet = useStore((s) => s.sheet)
  const filters = useStore((s) => s.filters)
  const key = `${sheet}|${filters.seat}|${filters.hidden.join()}|${filters.search}|${filters.hideUnavailable}`
  useEffect(() => {
    parent.current?.scrollTo({ top: 0 })
  }, [parent, key])
}
