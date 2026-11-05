/** Material Icons (Apache 2.0), as inline SVG so they work offline and need no font download. 24x24 viewBox. */
const PATHS = {
  sort: 'M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  remove: 'M19 13H5v-2h14v2z',
  keyboard_double_arrow_right: 'M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM11.59 7.41L16.18 12l-4.59 4.59L13 18l6-6-6-6z',
} as const

export type IconName = keyof typeof PATHS | 'drag_indicator'

const DOTS: [number, number][] = [[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]]

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {name === 'drag_indicator' ? DOTS.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />) : <path d={PATHS[name]} />}
    </svg>
  )
}
