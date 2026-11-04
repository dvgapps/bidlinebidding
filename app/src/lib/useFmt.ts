import { fmtDec, fmtHM } from './metrics'
import { useStore } from '../store'

/** Formatter for credit/block/TAFB minutes according to the "decimal vs h:mm" setting. */
export function useFmt(): (min: number | null | undefined) => string {
  const t = useStore((s) => s.timeFmt)
  return t === 'decimal' ? fmtDec : fmtHM
}
