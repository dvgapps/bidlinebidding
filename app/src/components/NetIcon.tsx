import { useOnline } from '../lib/useOnline'
import { Icon } from './Icon'

/** Beside a server button: a red cloud-off icon with no connection, a pulsing cloud-download icon while it works, else nothing. */
export function NetIcon({ busy }: { busy: boolean }) {
  const online = useOnline()
  if (!online) return <Icon name="cloud_off" size={20} className="off" />
  return busy ? <Icon name="cloud_download" size={20} className="pulse" /> : null
}
