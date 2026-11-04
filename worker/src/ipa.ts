/**
 * Parser for the IPA Snapshot mobile page (https://ipasnapshot.appspot.com/m?gems=<id>).
 * The page lists the lines you bid, in your bid order, with the status for your seniority. We read the
 * icon file name (Delete24 = unavailable, Add24 = available, Apply24 = current) and fail loudly when
 * the markup is not what we expect, so a layout change never silently reports wrong holds.
 */

export type IpaStatus = 'available' | 'unavailable' | 'current'

export interface IpaRow {
  /** position in your bid (1-based) */
  choice: number
  line: number
  status: IpaStatus
  /** reserve lines awarded several times: how many are still available */
  count?: number
}

export interface IpaSnapshot {
  /** e.g. "11/04/26 at 11:35z" exactly as the page prints it */
  updated: string | null
  holding: number | null
  seniorBids: number | null
  rows: IpaRow[]
}

export class IpaFormatError extends Error {}

/** No bid on file is transient (UPS sometimes drops a fleet): it means "no data", never "all unavailable". */
export class IpaNoDataError extends Error {}

const ICON: Record<string, IpaStatus> = { Delete24: 'unavailable', Add24: 'available', Apply24: 'current' }

const text = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

export function parseIpaMobile(html: string): IpaSnapshot {
  const blocks = html.match(/<li class="bidline[^"]*">[\s\S]*?<\/li>/g) ?? []
  const declared = (html.match(/class="bidline/g) ?? []).length

  if (blocks.length === 0) {
    if (/no\s+bid/i.test(html)) throw new IpaNoDataError('No bid on file (yet).')
    throw new IpaFormatError('Snapshot format changed: no bid lines found.')
  }
  if (blocks.length !== declared) throw new IpaFormatError('Snapshot format changed: could not read every line.')

  const rows: IpaRow[] = blocks.map((b, i) => {
    const icon = /([A-Za-z]+24)[^"/]*\.png/.exec(b)?.[1]
    const status = icon ? ICON[icon] : undefined
    const line = /<span class="linenum">\s*(\d+)\s*<\/span>/.exec(b)?.[1]
    const choice = /<span class="bidchoice">\s*(\d+)\s*<\/span>/.exec(b)?.[1]
    if (!status || !line || !choice) throw new IpaFormatError(`Snapshot format changed (line ${i + 1}).`)
    const row: IpaRow = { choice: Number(choice), line: Number(line), status }
    const avail = /<span class="avail">([\s\S]*?)<\/span>/.exec(b)?.[1]
    const n = avail ? /\d+/.exec(text(avail))?.[0] : undefined
    if (n) row.count = Number(n)
    if (/class="bidline[^"]*\baward\b/.test(b) && status !== 'current') {
      throw new IpaFormatError('Snapshot format changed: the held line is not marked current.')
    }
    return row
  })

  if (rows.filter((r) => r.status === 'current').length > 1) throw new IpaFormatError('Snapshot format changed: several current lines.')
  const seen = new Set<number>()
  for (const r of rows) {
    if (seen.has(r.line)) throw new IpaFormatError(`Snapshot format changed: line ${r.line} listed twice.`)
    seen.add(r.line)
  }

  const num = (re: RegExp): number | null => {
    const m = re.exec(html)?.[1]
    return m ? Number(m) : null
  }
  return {
    updated: /<span class="graytitle">\s*Updated:\s*([^<]+?)\s*<\/span>/.exec(html)?.[1] ?? null,
    holding: num(/Holding:<\/strong><\/td>\s*<td><strong>\s*(\d+)\s*<\/strong>/),
    seniorBids: num(/Senior Bids:<\/td>\s*<td>\s*(\d+)\s*<\/td>/),
    rows,
  }
}
