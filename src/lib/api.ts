// All database access goes through here. Amounts cross this boundary as
// rupees (Postgres numeric) and are converted to integer paise for the app.

import { supabase } from './supabase'
import { toPaise, toRupees } from './money'
import type { Category, Entry, EntryType, LedgerSummary, Member, Profile } from './types'

// Supabase returns { data, error }; turn errors into exceptions for react-query.
function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

// ── Ledgers ────────────────────────────────────────────────────

type LedgerSummaryRow = Omit<LedgerSummary, 'total_in' | 'total_out'> & { total_in: number; total_out: number }

export async function listLedgers(): Promise<LedgerSummary[]> {
  const rows = check(await supabase.from('ledger_summaries').select('*').order('name')) as LedgerSummaryRow[]
  return rows.map((r) => ({ ...r, total_in: toPaise(r.total_in), total_out: toPaise(r.total_out) }))
}

export async function getLedger(id: string): Promise<LedgerSummary | null> {
  const row = check(await supabase.from('ledger_summaries').select('*').eq('id', id).maybeSingle()) as LedgerSummaryRow | null
  return row && { ...row, total_in: toPaise(row.total_in), total_out: toPaise(row.total_out) }
}

export async function createLedger(name: string): Promise<{ id: string }> {
  return check(await supabase.from('ledgers').insert({ name: name.trim() }).select('id').single())
}

export async function renameLedger(id: string, name: string): Promise<void> {
  check(await supabase.from('ledgers').update({ name: name.trim() }).eq('id', id))
}

export async function deleteLedger(id: string): Promise<void> {
  check(await supabase.from('ledgers').delete().eq('id', id))
}

// ── Members ────────────────────────────────────────────────────

export async function listMembers(ledgerId: string): Promise<Member[]> {
  return check(
    await supabase
      .from('ledger_members')
      .select('ledger_id, user_id, role, profile:profiles(id, email, name)')
      .eq('ledger_id', ledgerId)
      .order('created_at'),
  ) as unknown as Member[]
}

export async function addMember(ledgerId: string, email: string): Promise<void> {
  check(await supabase.rpc('add_ledger_member', { p_ledger_id: ledgerId, p_email: email }))
}

export async function removeMember(ledgerId: string, userId: string): Promise<void> {
  check(await supabase.from('ledger_members').delete().eq('ledger_id', ledgerId).eq('user_id', userId))
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  return check(await supabase.from('profiles').select('id, email, name').eq('id', data.user.id).maybeSingle())
}

// ── Categories ─────────────────────────────────────────────────

export async function listCategories(ledgerId: string): Promise<Category[]> {
  return check(await supabase.from('categories').select('id, ledger_id, name').eq('ledger_id', ledgerId).order('name'))
}

export async function createCategory(ledgerId: string, name: string): Promise<Category> {
  return check(
    await supabase.from('categories').insert({ ledger_id: ledgerId, name: name.trim() }).select('id, ledger_id, name').single(),
  )
}

export async function renameCategory(id: string, name: string): Promise<void> {
  check(await supabase.from('categories').update({ name: name.trim() }).eq('id', id))
}

export async function deleteCategory(id: string): Promise<void> {
  check(await supabase.from('categories').delete().eq('id', id))
}

/** Returns a name → id map, creating any categories that don't exist yet. */
export async function ensureCategories(ledgerId: string, names: string[]): Promise<Map<string, string>> {
  const existing = await listCategories(ledgerId)
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]))
  const missing = [...new Set(names.map((n) => n.trim()).filter((n) => n && !byName.has(n.toLowerCase())))]
  // Dedupe case-insensitively, keeping the first spelling seen.
  const toCreate = [...new Map(missing.map((n) => [n.toLowerCase(), n])).values()]
  if (toCreate.length > 0) {
    const created = check(
      await supabase
        .from('categories')
        .insert(toCreate.map((name) => ({ ledger_id: ledgerId, name })))
        .select('id, name'),
    )
    for (const c of created) byName.set(c.name.toLowerCase(), c.id)
  }
  return byName
}

// ── Entries ────────────────────────────────────────────────────

const ENTRY_COLUMNS = 'id, ledger_id, type, amount, occurred_at, remark, category_id, created_by, created_at'
const PAGE = 1000 // Supabase's default max rows per request

/** Every entry in the ledger, oldest first. Personal ledgers are small enough to load whole. */
export async function listEntries(ledgerId: string): Promise<Entry[]> {
  const all: Entry[] = []
  for (let from = 0; ; from += PAGE) {
    const page = check(
      await supabase
        .from('entries')
        .select(ENTRY_COLUMNS)
        .eq('ledger_id', ledgerId)
        .order('occurred_at')
        .order('seq')
        .range(from, from + PAGE - 1),
    ) as (Omit<Entry, 'amount'> & { amount: number })[]
    for (const e of page) all.push({ ...e, amount: toPaise(e.amount) })
    if (page.length < PAGE) return all
  }
}

export type EntryInput = {
  type: EntryType
  amount: number
  occurred_at: string
  remark: string
  category_id: string | null
}

const toRow = (e: EntryInput) => ({ ...e, amount: toRupees(e.amount), remark: e.remark.trim() })

export async function createEntry(ledgerId: string, input: EntryInput): Promise<void> {
  check(await supabase.from('entries').insert({ ...toRow(input), ledger_id: ledgerId }))
}

export async function updateEntry(id: string, input: EntryInput): Promise<void> {
  check(await supabase.from('entries').update(toRow(input)).eq('id', id))
}

export async function deleteEntries(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    check(await supabase.from('entries').delete().in('id', ids.slice(i, i + 200)))
  }
}

export async function setEntriesCategory(ids: string[], categoryId: string | null): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    check(await supabase.from('entries').update({ category_id: categoryId }).in('id', ids.slice(i, i + 200)))
  }
}

/** Inserts in batches; calls onProgress with the number inserted so far. */
export async function importEntries(
  ledgerId: string,
  inputs: EntryInput[],
  onProgress?: (done: number) => void,
): Promise<void> {
  const BATCH = 500
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH).map((e) => ({ ...toRow(e), ledger_id: ledgerId }))
    check(await supabase.from('entries').insert(batch))
    onProgress?.(Math.min(i + BATCH, inputs.length))
  }
}
