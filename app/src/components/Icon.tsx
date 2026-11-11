/** Material Icons (Apache 2.0), as inline SVG so they work offline and need no font download. 24x24 viewBox. */
// Paths are the official files: Google Material Icons (Apache 2.0, @material-design-icons/svg, filled); `cloud_refresh_variant` is
// "cloud-refresh-variant" from Material Design Icons by Pictogrammers (@mdi/svg; Apache 2.0, see its LICENSE).
const PATHS = {
  arrow_right_alt: 'M16.01 11H4v2h12.01v3L20 12l-3.99-4z',
  sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  remove: 'M19 13H5v-2h14v2z',
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16a8.002 8.002 0 0 1 7.6-5.5c1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
  refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  keyboard_double_arrow_right: 'M6.41 6 5 7.41 9.58 12 5 16.59 6.41 18l6-6zm13 6-1.41 1.41L16.17 12l-4.58 4.59L13 18l6-6z',
  cloud_off: 'M19.35 10.04A7.49 7.49 0 0 0 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46a5.497 5.497 0 0 1 8.05 4.87v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z',
  cloud_download: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z',
  cloud_refresh_variant: 'M21.86 12.5C21.1 11.63 20.15 11.13 19 11C19 9.05 18.32 7.4 16.96 6.04C15.6 4.68 13.95 4 12 4C10.42 4 9 4.47 7.75 5.43S5.67 7.62 5.25 9.15C4 9.43 2.96 10.08 2.17 11.1S1 13.28 1 14.58C1 16.09 1.54 17.38 2.61 18.43C3.69 19.5 5 20 6.5 20H18.5C19.75 20 20.81 19.56 21.69 18.69C22.56 17.81 23 16.75 23 15.5C23 14.35 22.62 13.35 21.86 12.5M16 13H12L13.77 11.23C13.32 10.78 12.69 10.5 12 10.5C10.62 10.5 9.5 11.62 9.5 13S10.62 15.5 12 15.5C12.82 15.5 13.54 15.11 14 14.5H15.71C15.12 15.97 13.68 17 12 17C9.79 17 8 15.21 8 13S9.79 9 12 9C13.11 9 14.11 9.45 14.83 10.17L16 9V13Z',
} as const

export type IconName = keyof typeof PATHS | 'drag_indicator'

const DOTS: [number, number][] = [[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]]

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {name === 'drag_indicator' ? DOTS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />) : <path d={PATHS[name]} />}
    </svg>
  )
}
