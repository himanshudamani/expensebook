import { endOfDayExclusive, firstOfMonth, lastOfMonth, startOfDay, todayKey } from './dates'
import type { EntryType, EntryWithBalance } from './types'

/** Filters live in the URL (?from=…&type=…) so Back and refresh keep them. */
export type Filters = {
  from: string // "YYYY-MM-DD", inclusive, '' = no bound
  to: string // "YYYY-MM-DD", inclusive, '' = no bound
  type: EntryType | ''
  category: string // category id, 'none' for uncategorized, '' = all
  member: string // user id, '' = all
  q: string
}

export const UNCATEGORIZED = 'none'

export function readFilters(p: URLSearchParams): Filters {
  const type = p.get('type')
  return {
    from: p.get('from') ?? '',
    to: p.get('to') ?? '',
    type: type === 'in' || type === 'out' ? type : '',
    category: p.get('cat') ?? '',
    member: p.get('by') ?? '',
    q: p.get('q') ?? '',
  }
}

export function writeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.type) p.set('type', f.type)
  if (f.category) p.set('cat', f.category)
  if (f.member) p.set('by', f.member)
  if (f.q) p.set('q', f.q)
  return p
}

export function hasFilters(f: Filters): boolean {
  return Boolean(f.from || f.to || f.type || f.category || f.member || f.q.trim())
}

export function applyFilters(entries: EntryWithBalance[], f: Filters): EntryWithBalance[] {
  const fromIso = f.from ? startOfDay(f.from) : ''
  const toIso = f.to ? endOfDayExclusive(f.to) : ''
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return entries.filter((e) => {
    // Compare as Date values: Postgres and JS format ISO timestamps differently.
    const t = new Date(e.occurred_at).getTime()
    if (fromIso && t < new Date(fromIso).getTime()) return false
    if (toIso && t >= new Date(toIso).getTime()) return false
    if (f.type && e.type !== f.type) return false
    if (f.category === UNCATEGORIZED ? e.category_id !== null : f.category && e.category_id !== f.category) return false
    if (f.member && e.created_by !== f.member) return false
    if (terms.length) {
      const remark = e.remark.toLowerCase()
      if (!terms.every((t) => remark.includes(t))) return false
    }
    return true
  })
}

export type DatePreset = { label: string; from: string; to: string }

export function datePresets(): DatePreset[] {
  const today = todayKey()
  const lastMonth = firstOfMonth(today, -1)
  return [
    { label: 'All time', from: '', to: '' },
    { label: 'Today', from: today, to: today },
    { label: 'This month', from: firstOfMonth(today), to: lastOfMonth(today) },
    { label: 'Last month', from: lastMonth, to: lastOfMonth(lastMonth) },
    { label: 'Last 3 months', from: firstOfMonth(today, -2), to: lastOfMonth(today) },
    { label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` },
  ]
}

export function totals(entries: { type: EntryType; amount: number }[]) {
  let totalIn = 0
  let totalOut = 0
  for (const e of entries) {
    if (e.type === 'in') totalIn += e.amount
    else totalOut += e.amount
  }
  return { totalIn, totalOut }
}

/**
 * Ledger balance before and at the end of the filtered date range, like
 * CashBook's "Opening Balance" when you pick dates. Uses every entry in the
 * ledger, not just the filtered ones: it's the real balance on those days.
 * Null when no start date is set (opening would always be ₹0).
 * Entries must be oldest first.
 */
export function periodBalances(entries: EntryWithBalance[], f: Filters): { opening: number; closing: number } | null {
  if (!f.from) return null
  const fromTime = new Date(startOfDay(f.from)).getTime()
  const toTime = f.to ? new Date(endOfDayExclusive(f.to)).getTime() : Infinity

  let opening = 0
  let closing = 0
  for (const e of entries) {
    const t = new Date(e.occurred_at).getTime()
    if (t < fromTime) opening = e.balance
    if (t < toTime) closing = e.balance
    else break
  }
  return { opening, closing }
}
