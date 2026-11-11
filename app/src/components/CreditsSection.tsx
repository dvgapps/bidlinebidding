import { useState } from 'react'

const LICENSE = {
  mit: 'MIT License',
  apache: 'Apache License 2.0',
} as const

/** The open-source software BidlineBidding is built with (and the icons), with its license and project page. */
const ATTRIBUTIONS: { name: string; license: keyof typeof LICENSE; url: string }[] = [
  { name: 'React', license: 'mit', url: 'https://react.dev' },
  { name: 'TanStack Virtual (the long lists)', license: 'mit', url: 'https://tanstack.com/virtual' },
  { name: 'Dexie.js (the on-device database)', license: 'apache', url: 'https://dexie.org' },
  { name: 'Zustand (the app state)', license: 'mit', url: 'https://zustand.docs.pmnd.rs' },
  { name: 'Vite, vite-plugin-pwa and Workbox (building the app and working offline)', license: 'mit', url: 'https://vite.dev' },
  { name: 'Material Icons by Google (most of the icons)', license: 'apache', url: 'https://fonts.google.com/icons' },
  { name: 'Material Design Icons by Pictogrammers (the Holding cloud icon)', license: 'apache', url: 'https://pictogrammers.com/library/mdi/' },
  { name: 'pdfplumber (the PC tool that reads the bid package PDFs)', license: 'mit', url: 'https://github.com/jsvine/pdfplumber' },
]

/** Preferences > Credits: collapsed until tapped, like the GroceryList app's open-source libraries list. */
export function CreditsSection() {
  const [open, setOpen] = useState(false)
  return (
    <section className="cell" aria-label="Credits">
      <h3>Credits</h3>
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Open-Source Libraries
        <span className={`chevron ${open ? 'chevron-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <>
          <p className="muted small">This app is built with the open-source software below. Tap one to see its project page and license.</p>
          <ul className="credits">
            {ATTRIBUTIONS.map((item) => (
              <li key={item.name}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <span>{item.name}</span>
                  <small>{LICENSE[item.license]}</small>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
