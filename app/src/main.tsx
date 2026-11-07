import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// The service worker (offline files) is registered and checked for updates only when there is a connection, so launching the app
// offline makes no network request at all. When the connection returns, it is registered then.
const startServiceWorker = () => registerSW({ immediate: true })
if (navigator.onLine) startServiceWorker()
else window.addEventListener('online', startServiceWorker, { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
