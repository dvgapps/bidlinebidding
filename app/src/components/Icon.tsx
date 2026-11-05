/** Material Icons (Apache 2.0), as inline SVG so they work offline and need no font download. 24x24 viewBox. */
const PATHS = {
  sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  remove: 'M19 13H5v-2h14v2z',
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
  refresh: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  keyboard_double_arrow_right: 'M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM11.59 7.41L16.18 12l-4.59 4.59L13 18l6-6-6-6z',
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
