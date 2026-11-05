import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, type Toast as ToastData } from '../store'

const FADE_MS = 220

/** A short, non-blocking message at the bottom of the screen: it fades in, stays for `toast.ms`, fades out. */
export function Toast() {
  const toast = useStore((s) => s.toast)
  // keyed by id: a new message starts a fresh timer and a fresh fade. In a portal on <body>, so no pop-up (which is also
  // in a portal) can sit above it.
  return toast ? createPortal(<ToastBody key={toast.id} toast={toast} />, document.body) : null
}

function ToastBody({ toast }: { toast: ToastData }) {
  const dismiss = useStore((s) => s.dismissToast)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), Math.max(0, toast.ms - FADE_MS))
    const gone = setTimeout(dismiss, toast.ms)
    return () => {
      clearTimeout(fade)
      clearTimeout(gone)
    }
  }, [toast.ms, dismiss])
  return (
    <div className={`toast ${leaving ? 'leaving' : ''}`} role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo?.()
            dismiss()
          }}
        >
          Undo
        </button>
      )}
    </div>
  )
}
