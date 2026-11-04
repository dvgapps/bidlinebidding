import { useEffect } from 'react'
import { useStore } from '../store'

export function Toast() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismiss, 6000)
    return () => clearTimeout(t)
  }, [toast, dismiss])
  if (!toast) return null
  return (
    <div className="toast" role="status">
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
