import { create } from 'zustand'
import { downloadServerPackage, listServerPackages, pickNewer, type PackageMeta } from './lib/packages'
import { fetchIpa, holdMap, snapshotMismatch, type IpaRow, type IpaSnapshot } from './lib/ipa'
import { getSyncConfig, saveSyncConfig, signIn, syncAll } from './lib/sync'
import { computeAllMetrics, type LineMetrics } from './lib/metrics'
import { carryFromLine } from './lib/carry'
import { kvGet, kvSet, loadLatestPackage, loadPackageBefore, requestPersistence, savePackage, validateBundle } from './lib/db'
import { defaultFilters, type Filters, type SortKey } from './lib/filter'
import { criterionLabel, sortByCriteria, sortValue, type SortCriterion } from './lib/sorting'
import { computeDto, formatRange, addDays, clampIso, desiredDates, patchRangeAt, sortRanges, type DateRange, type DtoResult } from './lib/dto'
import {
  commit, emptyHistory, initialLists, moveToSheet, redo as redoH, sheetLabel, sortList, undo as undoH,
  type Dest, type History, type Lists, type Sheet,
} from './lib/rank'
import { importRanking as importRankingText, type RankingImport, type UnlistedMode } from './lib/ranking'
import type { Bundle, Seat } from './types'

export type View = 'table' | 'calendar'
type TimeFmt = 'decimal' | 'hm'

interface Prefs {
  view: View
  filters: Filters
  timeFmt: TimeFmt
  /** green vacation shading on every line; reset to true each time a package is uploaded */
  showVacation: boolean
  /** highlight desired dates off (and their conflict boxes) on the lines; reset to true on package upload */
  showDesired: boolean
  /** the criteria in the Sort pane, kept between launches */
  sortCriteria: SortCriterion[]
}

const PREFS_KEY = 'bidline-prefs-v2'
const defaults: Prefs = { view: 'table', filters: defaultFilters, timeFmt: 'decimal', showVacation: true, showDesired: true, sortCriteria: [] }

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return { ...defaults, ...p, filters: { ...defaultFilters, ...p.filters } }
    }
  } catch {
    /* storage unavailable: fall back to defaults */
  }
  return defaults
}

function savePrefs({ view, filters, timeFmt, showVacation, showDesired, sortCriteria }: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ view, filters, timeFmt, showVacation, showDesired, sortCriteria }))
  } catch {
    /* ignore */
  }
}

const workKey = (b: Bundle, seat: Seat) => `work:${b.bidPeriod.id}:${seat}`
const datesKey = (b: Bundle) => `dates:${b.bidPeriod.id}`
const VACATION_KEY = 'vacation'
const carryKey = (b: Bundle) => `carry:${b.bidPeriod.id}`
interface CarryDoc {
  ranges: DateRange[]
  awarded: number | null
}
/** Current contract: at most five vacation periods. */
export const MAX_VACATION = 5

/** Saved lists reconciled with the package: unknown lines dropped, eligible lines never seen are appended. */
function reconcile(saved: Lists | null, bundle: Bundle, seat: Seat): Lists {
  const eligible = bundle.lines.filter((l) => l.eligible[seat]).map((l) => l.number)
  if (!saved) return initialLists(eligible)
  const ok = new Set(eligible)
  const seen = new Set<number>()
  const out = { bidding: [] as number[], work1: [] as number[], work2: [] as number[], excluded: [] as number[] }
  for (const s of Object.keys(out) as Sheet[]) {
    for (const n of saved[s] ?? []) if (ok.has(n) && !seen.has(n)) {
        seen.add(n)
        out[s].push(n)
      }
  }
  for (const n of eligible) if (!seen.has(n)) out.bidding.push(n)
  return out
}

export interface SyncState {
  /** a server address and sign-in are stored on this device */
  configured: boolean
  status: 'idle' | 'syncing' | 'error'
  last: number | null
  message: string | null
}

export interface IpaState {
  snapshot: IpaSnapshot | null
  fetchedAt: number | null
  /** bid period the snapshot was fetched for */
  bid: string | null
  status: 'idle' | 'loading' | 'error'
  message: string | null
}

const IPA_KEY = 'bidline-ipa-v1'
function loadIpa(): IpaState {
  try {
    const raw = localStorage.getItem(IPA_KEY)
    if (raw) return { ...(JSON.parse(raw) as Partial<IpaState>), status: 'idle', message: null } as IpaState
  } catch {
    /* ignore */
  }
  return { snapshot: null, fetchedAt: null, bid: null, status: 'idle', message: null }
}
function saveIpa(s: IpaState) {
  try {
    localStorage.setItem(IPA_KEY, JSON.stringify({ snapshot: s.snapshot, fetchedAt: s.fetchedAt, bid: s.bid }))
  } catch {
    /* ignore */
  }
}

export interface Toast {
  text: string
  undo?: () => void
  /** how long it stays on screen (ms); a toast with an Undo button stays longer */
  ms: number
  id: number
}

interface State extends Prefs {
  status: 'loading' | 'empty' | 'ready'
  error: string | null
  bundle: Bundle | null
  metrics: Map<number, LineMetrics>
  lists: Lists
  history: History
  sheet: Sheet
  selected: Set<number>
  desired: DateRange[]
  /** vacation date ranges (contract allows at most MAX_VACATION), kept across bid periods */
  vacation: DateRange[]
  /** carry-in trip dates from the previous bid period, for the loaded bid (entered by hand or derived from the awarded line) */
  carry: DateRange[]
  carryAwarded: number | null
  dto: Map<number, DtoResult>
  selectedLine: number | null
  /** `date` = the local start date of the instance being viewed (BidPro shows dates per instance) */
  selectedTrip: { id: string; line: number | null; date?: string } | null
  toast: Toast | null
  sync: SyncState
  /** packages uploaded from the PC to your server, and what a check found */
  server: { packages: PackageMeta[]; status: 'idle' | 'loading' | 'error'; message: string | null }
  /** a newer package than the loaded one is waiting on the server */
  newPackage: PackageMeta | null
  ipa: IpaState
  /** line -> IPA status, derived from the snapshot */
  hold: Map<number, IpaRow>

  init: () => Promise<void>
  importText: (text: string) => Promise<void>
  importUrl: (url: string) => Promise<void>
  setView: (v: View) => void
  setFilters: (f: Partial<Filters>) => void
  setTimeFmt: (t: TimeFmt) => void
  selectLine: (n: number | null) => void
  selectTrip: (t: { id: string; line: number | null; date?: string } | null) => void

  setSheet: (s: Sheet) => void
  toggleSelect: (n: number) => void
  setSelection: (ns: Iterable<number>) => void
  clearSelection: () => void
  /** Move the selected lines (or `ids`) within the active sheet or to another sheet. */
  /** Apply a pasted ranking (e.g. from BidPro) to the Bidding worksheet; `apply: false` only previews it. */
  importRanking: (text: string, mode: UnlistedMode, apply: boolean) => RankingImport
  move: (dest: Dest, toSheet?: Sheet, ids?: Iterable<number>) => void
  sortBy: (key: SortKey, dir: 'asc' | 'desc') => void
  setSortCriteria: (criteria: SortCriterion[]) => void
  /** sort the current worksheet by the Sort pane's criteria, in order */
  applySort: () => void
  undo: () => void
  redo: () => void

  addRange: () => void
  addVacation: () => void
  addCarry: () => void
  updateCarry: (i: number, patch: { start?: string; end?: string }) => void
  removeCarry: (i: number) => void
  /** Derive carry-in from the line awarded in the previous bid period; returns a message for the user. */
  deriveCarry: (line: number) => Promise<string>
  updateVacation: (i: number, patch: { start?: string; end?: string }) => void
  removeVacation: (i: number) => void
  setShowVacation: (on: boolean) => void
  setShowDesired: (on: boolean) => void
  updateRange: (i: number, patch: { start?: string; end?: string }) => void
  removeRange: (i: number) => void
  dismissToast: () => void
  notify: (text: string) => void
  syncSignIn: (url: string, passphrase: string) => Promise<void>
  syncSignOut: () => void
  syncNow: () => Promise<void>
  refreshIpa: () => Promise<void>
  refreshServerPackages: () => Promise<void>
  loadServerPackage: (id: string) => Promise<void>
  /** Restore rankings + desired dates from a backup JSON object. Throws a readable Error if it does not fit. */
  restore: (data: unknown) => void
}

let toastId = 0

export const useStore = create<State>((set, get) => {
  let syncTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleSync = () => {
    if (!get().sync.configured || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    clearTimeout(syncTimer)
    syncTimer = setTimeout(() => void get().syncNow(), 2500)
  }
  /** Save a document locally (always) and queue a background sync (when a server is configured). */
  const save = (key: string, value: unknown) => {
    void kvSet(key, value).then(scheduleSync)
  }
  /** Re-read the synced documents after a pull. */
  const reloadFromKv = async () => {
    const { bundle, filters } = get()
    const vac = await kvGet<DateRange[]>(VACATION_KEY)
    set({ vacation: sortRanges(vac ?? []).slice(0, MAX_VACATION) })
    if (!bundle) return
    const carryDoc = await kvGet<CarryDoc>(carryKey(bundle))
    set({ carry: sortRanges(carryDoc?.ranges ?? []), carryAwarded: carryDoc?.awarded ?? null })
    const [saved, dates] = await Promise.all([kvGet<Lists>(workKey(bundle, filters.seat)), kvGet<DateRange[]>(datesKey(bundle))])
    const desired = sortRanges(dates ?? [])
    set({ lists: reconcile(saved, bundle, filters.seat), history: emptyHistory(), selected: new Set(), desired, dto: recomputeDto(desired) })
  }

  const persistLists = () => {
    const { bundle, lists, filters } = get()
    if (bundle) save(workKey(bundle, filters.seat), lists)
  }
  const persistDates = () => {
    const { bundle, desired } = get()
    if (bundle) save(datesKey(bundle), desired)
  }
  const recomputeDto = (desired: DateRange[]) => {
    const { bundle } = get()
    const dates = desiredDates(desired)
    return new Map((bundle?.lines ?? []).map((l) => [l.number, computeDto(l, dates)]))
  }
  const say = (text: string, undo?: () => void, ms = undo ? 6000 : 2000) => set({ toast: { text, undo, ms, id: ++toastId } })
  /** Change preferences and keep them across launches. */
  const setPref = (p: Partial<Prefs>) => {
    set(p)
    savePrefs(get())
  }
  /** Update part of one of the status objects (sync, server, ipa) without touching the rest of it. */
  const patchState = <K extends 'sync' | 'server' | 'ipa'>(key: K, value: Partial<State[K]>) =>
    set({ [key]: { ...get()[key], ...value } } as Pick<State, K>)
  const saveCarry = (b: Bundle, ranges: DateRange[], awarded = get().carryAwarded) => save(carryKey(b), { ranges, awarded })

  /** Apply a change to the lists, recording undo history and persisting. */
  const change = (next: Lists, message?: string) => {
    const { lists, history } = get()
    if (next === lists) return
    set({ lists: next, history: commit(history, lists) })
    persistLists()
    if (message) say(message, () => get().undo())
  }

  const open = async (b: Bundle) => {
    const seat = get().filters.seat
    const [saved, dates, carryDoc] = await Promise.all([kvGet<Lists>(workKey(b, seat)), kvGet<DateRange[]>(datesKey(b)), kvGet<CarryDoc>(carryKey(b))])
    const desired = sortRanges(dates ?? [])
    set({ carry: sortRanges(carryDoc?.ranges ?? []), carryAwarded: carryDoc?.awarded ?? null })
    if (get().ipa.bid && get().ipa.bid !== b.bidPeriod.id) {
      const fresh: IpaState = { snapshot: null, fetchedAt: null, bid: null, status: 'idle', message: null }
      set({ ipa: fresh, hold: new Map() })
      saveIpa(fresh)
    }
    set({
      bundle: b,
      metrics: computeAllMetrics(b),
      lists: reconcile(saved, b, seat),
      history: emptyHistory(),
      sheet: 'bidding',
      selected: new Set(),
      desired,
      status: 'ready',
      selectedLine: null,
      selectedTrip: null,
    })
    set({ dto: recomputeDto(desired) })
  }

  return {
    ...loadPrefs(),
    status: 'loading',
    error: null,
    bundle: null,
    metrics: new Map(),
    lists: initialLists([]),
    history: emptyHistory(),
    sheet: 'bidding',
    selected: new Set(),
    desired: [],
    vacation: [],
    carry: [],
    carryAwarded: null,
    dto: new Map(),
    selectedLine: null,
    selectedTrip: null,
    toast: null,
    sync: { configured: !!getSyncConfig(), status: 'idle', last: null, message: null },
    server: { packages: [], status: 'idle', message: null },
    newPackage: null,
    ipa: loadIpa(),
    hold: holdMap(loadIpa().snapshot),

    async init() {
      try {
        const vac = await kvGet<DateRange[]>(VACATION_KEY)
        if (vac) set({ vacation: sortRanges(vac).slice(0, MAX_VACATION) })
        const b = await loadLatestPackage()
        if (b) await open(b)
        else set({ status: 'empty' })
        void get()
          .syncNow()
          .then(() => (get().sync.configured ? Promise.all([get().refreshIpa(), get().refreshServerPackages()]) : undefined))
      } catch (e) {
        set({ status: 'empty', error: `Could not read saved package: ${(e as Error).message}` })
      }
    },

    async importText(text) {
      try {
        const b = validateBundle(JSON.parse(text))
        await open(b)
        set({ error: null })
        setPref({ showVacation: true, showDesired: true })
        void requestPersistence()
        await savePackage(b).catch((e) => set({ error: `Loaded, but could not save for offline use: ${e.message}` }))
      } catch (e) {
        set({ error: (e as Error).message })
      }
    },

    async importUrl(url) {
      try {
        const r = await fetch(url)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        await get().importText(await r.text())
      } catch (e) {
        set({ error: `Could not load ${url}: ${(e as Error).message}` })
      }
    },

    setView: (view) => setPref({ view }),
    setFilters: (f) => {
      const prev = get().filters
      setPref({ filters: { ...prev, ...f } })
      if (f.seat && f.seat !== prev.seat && get().bundle) void open(get().bundle!)
    },
    setTimeFmt: (timeFmt) => setPref({ timeFmt }),
    selectLine: (selectedLine) => set({ selectedLine }),
    selectTrip: (selectedTrip) => set({ selectedTrip }),

    setSheet: (sheet) => set({ sheet, selected: new Set() }),
    toggleSelect: (n) => {
      const s = new Set(get().selected)
      if (!s.delete(n)) s.add(n)
      set({ selected: s })
    },
    setSelection: (ns) => set({ selected: new Set(ns) }),
    clearSelection: () => set({ selected: new Set() }),

    importRanking(text, mode, apply) {
      const { bundle, lists, filters } = get()
      const pkg = bundle?.lines ?? []
      const r = importRankingText(
        text,
        lists,
        new Set(pkg.filter((l) => l.eligible[filters.seat]).map((l) => l.number)),
        new Set(pkg.map((l) => l.number)),
        mode,
      )
      if (apply && r.lists) {
        change(r.lists, `Imported a ranking of ${r.matched.length} lines`)
        set({ sheet: 'bidding', selected: new Set() })
      }
      return r
    },
    move(dest, toSheet, ids) {
      const { lists, sheet, selected } = get()
      const moving = [...(ids ?? selected)]
      if (moving.length === 0) return
      const to = toSheet ?? sheet
      const next = moveToSheet(lists, sheet, moving, to, dest)
      const n = moving.length
      const what = n === 1 ? `Line ${moving[0]}` : `${n} lines`
      const where =
        to !== sheet
          ? `to ${sheetLabel(to)}`
          : dest.kind === 'start'
            ? 'to the start'
            : dest.kind === 'end'
              ? 'to the end'
              : `${dest.kind} line ${dest.target}`
      change(next, `Moved ${what} ${where}`)
      if (!ids || to !== sheet) set({ selected: new Set() })
    },

    sortBy(key, dir) {
      const { lists, sheet, metrics, dto, hold } = get()
      const ctx = { metrics, dto, hold }
      change({ ...lists, [sheet]: sortList(lists[sheet], (n) => sortValue(key, n, ctx) ?? -1, dir) }, `Sorted by ${key.toUpperCase()} ${dir === 'asc' ? '↑' : '↓'}`)
    },
    setSortCriteria: (sortCriteria) => setPref({ sortCriteria }),
    applySort() {
      const { lists, sheet, metrics, dto, hold, sortCriteria } = get()
      if (sortCriteria.length === 0) return
      const sorted = sortByCriteria(lists[sheet], sortCriteria, { metrics, dto, hold })
      change({ ...lists, [sheet]: sorted }, `Sorted by ${sortCriteria.map((c) => criterionLabel(c.key)).join(' → ')}`)
    },

    undo() {
      const r = undoH(get().history, get().lists)
      if (!r) return
      set({ lists: r.lists, history: r.history })
      persistLists()
    },
    redo() {
      const r = redoH(get().history, get().lists)
      if (!r) return
      set({ lists: r.lists, history: r.history })
      persistLists()
    },

    addRange() {
      const { bundle, desired } = get()
      if (!bundle) return
      const first = bundle.lines[0].days[0].date
      const last = bundle.lines[0].days[bundle.lines[0].days.length - 1].date
      const after = desired.length ? clampIso(addDays(desired[desired.length - 1].end, 1), first, last) : first
      const next = sortRanges([...desired, { start: after, end: after }])
      set({ desired: next, dto: recomputeDto(next) })
      persistDates()
    },
    updateRange(i, patch) {
      const next = patchRangeAt(get().desired, i, patch)
      if (!next) return
      set({ desired: next, dto: recomputeDto(next) })
      persistDates()
    },
    removeRange(i) {
      const { desired } = get()
      const gone = desired[i]
      if (!gone) return
      const next = desired.filter((_x, k) => k !== i)
      set({ desired: next, dto: recomputeDto(next) })
      persistDates()
      say(`Removed ${formatRange(gone)}`, () => {
        const cur = sortRanges([...get().desired, gone])
        set({ desired: cur, dto: recomputeDto(cur), toast: null })
        persistDates()
      })
    },
    addCarry() {
      const { bundle, carry } = get()
      if (!bundle) return
      const first = bundle.lines[0].days[0].date
      const next = sortRanges([...carry, { start: first, end: first }])
      set({ carry: next })
      saveCarry(bundle, next)
    },
    updateCarry(i, patch) {
      const { bundle, carry } = get()
      const next = patchRangeAt(carry, i, patch)
      if (!next || !bundle) return
      set({ carry: next })
      saveCarry(bundle, next)
    },
    removeCarry(i) {
      const { bundle, carry } = get()
      const gone = carry[i]
      if (!gone || !bundle) return
      const next = carry.filter((_x, k) => k !== i)
      set({ carry: next })
      saveCarry(bundle, next)
      say(`Removed carry-in ${formatRange(gone)}`, () => {
        const cur = sortRanges([...get().carry, gone])
        set({ carry: cur, toast: null })
        saveCarry(bundle, cur)
      })
    },
    async deriveCarry(line) {
      const { bundle } = get()
      if (!bundle) return 'Load the new bid package first.'
      const prev = await loadPackageBefore(bundle.bidPeriod.id)
      if (!prev) return 'The previous bid package is not stored on this device, so enter the carry-in dates by hand.'
      const l = prev.lines.find((x) => x.number === line)
      if (!l) return `Line ${line} is not in package ${prev.bidPeriod.id}.`
      const ranges = carryFromLine(l, bundle.lines[0].days[0].date)
      set({ carry: ranges, carryAwarded: line })
      saveCarry(bundle, ranges, line)
      return ranges.length
        ? `Line ${line} of bid ${prev.bidPeriod.id} carries ${ranges.length} trip${ranges.length === 1 ? '' : 's'} into this period.`
        : `Line ${line} of bid ${prev.bidPeriod.id} has no trip running into this period.`
    },
    addVacation() {
      const { vacation, bundle } = get()
      if (vacation.length >= MAX_VACATION) return
      const base = vacation.length ? addDays(vacation[vacation.length - 1].end, 1) : (bundle?.lines[0].days[0].date ?? new Date().toISOString().slice(0, 10))
      const next = sortRanges([...vacation, { start: base, end: base }])
      set({ vacation: next })
      save(VACATION_KEY, next)
    },
    updateVacation(i, patch) {
      const next = patchRangeAt(get().vacation, i, patch)
      if (!next) return
      set({ vacation: next })
      save(VACATION_KEY, next)
    },
    removeVacation(i) {
      const { vacation } = get()
      const gone = vacation[i]
      if (!gone) return
      const next = vacation.filter((_x, k) => k !== i)
      set({ vacation: next })
      save(VACATION_KEY, next)
      say(`Removed vacation ${formatRange(gone)}`, () => {
        const cur = sortRanges([...get().vacation, gone]).slice(0, MAX_VACATION)
        set({ vacation: cur, toast: null })
        save(VACATION_KEY, cur)
      })
    },
    setShowDesired: (showDesired) => setPref({ showDesired }),
    setShowVacation: (showVacation) => setPref({ showVacation }),
    dismissToast: () => set({ toast: null }),
    notify: (text) => say(text),
    async syncSignIn(url, passphrase) {
      patchState('sync', { status: 'syncing', message: null })
      try {
        await signIn(url, passphrase)
        patchState('sync', { configured: true, status: 'idle', message: null })
        await get().syncNow()
        void get().refreshServerPackages()
      } catch (e) {
        patchState('sync', { status: 'error', message: (e as Error).message })
      }
    },
    syncSignOut() {
      saveSyncConfig(null)
      set({ sync: { configured: false, status: 'idle', last: null, message: null } })
    },
    async refreshServerPackages() {
      const cfg = getSyncConfig()
      if (!cfg) {
        set({ server: { packages: [], status: 'error', message: 'Sign in under Sync first.' }, newPackage: null })
        return
      }
      patchState('server', { status: 'loading', message: null })
      try {
        const packages = await listServerPackages(cfg)
        const { bundle } = get()
        const loaded = bundle ? { id: bundle.bidPeriod.id, generated: bundle.bidPeriod.generated } : null
        set({
          server: { packages, status: 'idle', message: packages.length ? null : 'No package has been published to the server yet.' },
          newPackage: pickNewer(packages, loaded),
        })
      } catch (e) {
        patchState('server', { status: 'error', message: (e as Error).message })
      }
    },
    async loadServerPackage(id) {
      const cfg = getSyncConfig()
      if (!cfg) return
      patchState('server', { status: 'loading', message: null })
      try {
        const text = await downloadServerPackage(cfg, id)
        await get().importText(text)
        set({ server: { ...get().server, status: get().error ? 'error' : 'idle', message: get().error ?? `Loaded package ${id}.` }, newPackage: null })
        void get().refreshServerPackages()
      } catch (e) {
        patchState('server', { status: 'error', message: (e as Error).message })
      }
    },
    async refreshIpa() {
      const cfg = getSyncConfig()
      const { bundle } = get()
      if (!cfg) {
        patchState('ipa', { status: 'error', message: 'Sign in under Preferences > Sync first (the IPA Snapshot is fetched by your Cloudflare Worker).' })
        return
      }
      patchState('ipa', { status: 'loading', message: null })
      try {
        const r = await fetchIpa(cfg)
        const snapshot = r.snapshot ?? get().ipa.snapshot
        const numbers = new Set((bundle?.lines ?? []).map((l) => l.number))
        const off = snapshotMismatch(snapshot, numbers)
        const message =
          r.warning ??
          (off > 0 ? `${off} lines on the IPA Snapshot are not in this package; it may be for a different bid period.` : null)
        const ipa: IpaState = { snapshot, fetchedAt: r.fetchedAt ?? get().ipa.fetchedAt, bid: bundle?.bidPeriod.id ?? null, status: 'idle', message }
        set({ ipa, hold: holdMap(snapshot) })
        saveIpa(ipa)
      } catch (e) {
        patchState('ipa', { status: 'error', message: (e as Error).message })
      }
    },
    async syncNow() {
      const cfg = getSyncConfig()
      if (!cfg) return
      if (cfg.expires < Date.now()) {
        patchState('sync', { status: 'error', message: 'The sign-in expired. Sign in again.' })
        return
      }
      patchState('sync', { configured: true, status: 'syncing', message: null })
      try {
        const r = await syncAll(cfg)
        if (r.pulled.length) await reloadFromKv()
        set({ sync: { configured: true, status: 'idle', last: Date.now(), message: null } })
      } catch (e) {
        patchState('sync', { status: 'error', message: (e as Error).message })
      }
    },
    restore(data) {
      const { bundle, filters } = get()
      const d = data as { type?: string; bid?: string; seat?: Seat; lists?: Lists; desired?: DateRange[] }
      if (!bundle || d?.type !== 'bidline-backup') throw new Error('Not a Bidline Bidding backup file.')
      if (d.bid !== bundle.bidPeriod.id) throw new Error(`This backup is for bid ${d.bid}, but bid ${bundle.bidPeriod.id} is loaded.`)
      const seat = d.seat ?? filters.seat
      if (seat !== filters.seat) throw new Error(`This backup is for the ${seat === 'captain' ? 'CPT' : 'FO'} seat; switch the seat first.`)
      const lists = reconcile(d.lists ?? null, bundle, seat)
      const desired = sortRanges(Array.isArray(d.desired) ? d.desired.filter((r) => r.start && r.end && r.end >= r.start) : [])
      change(lists, 'Backup restored')
      set({ desired, dto: recomputeDto(desired) })
      persistDates()
    },
  }
})

// sync again whenever the iPad comes back online or the app returns to the foreground
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void useStore.getState().syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void useStore.getState().syncNow()
  })
}
