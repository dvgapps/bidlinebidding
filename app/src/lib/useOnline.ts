import { useSyncExternalStore } from 'react'

const subscribe = (notify: () => void) => {
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)
  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}

/** True unless the device says it has no connection; re-renders when that changes. */
export const useOnline = (): boolean => useSyncExternalStore(subscribe, () => navigator.onLine !== false, () => true)
