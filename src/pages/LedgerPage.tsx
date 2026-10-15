import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useUserId } from '../auth/AuthProvider'
import { EntryFormModal } from '../components/EntryForm'
import { FilterBar } from '../components/FilterBar'
import { ErrorBox, Modal, Money, PageHeader, Spinner, TotalsBar } from '../components/ui'
import { deleteEntries, setEntriesCategory } from '../lib/api'
import { formatDateKey, formatTime, toDateKey } from '../lib/dates'
import { exportLedgerCsv } from '../lib/download'
import { applyFilters, hasFilters, periodBalances, readFilters, totals, writeFilters, type Filters } from '../lib/filters'
import { useCategories, useEntriesWithBalance, useInvalidateLedger, useLedger, useMembers } from '../lib/queries'
import type { Entry, EntryType, EntryWithBalance } from '../lib/types'

const ReportsView = lazy(() => import('../components/ReportsView'))

const PAGE_SIZE = 200

export function LedgerPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(params), [params])
  const tab = params.get('tab') === 'reports' ? 'reports' : 'entries'

  const ledger = useLedger(id)
  const entries = useEntriesWithBalance(id)
  const categories = useCategories(id)
  const members = useMembers(id)

  const [formTarget, setFormTarget] = useState<{ type: EntryType } | { entry: Entry } | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE_SIZE)

  const setFilters = useCallback(
    (f: Filters) => {
      const p = writeFilters(f)
      if (tab === 'reports') p.set('tab', 'reports')
      setParams(p, { replace: true })
      setLimit(PAGE_SIZE)
    },
    [setParams, setLimit, tab],
  )
  const setTab = (t: 'entries' | 'reports') => {
    const p = writeFilters(filters)
    if (t === 'reports') p.set('tab', 'reports')
    setParams(p, { replace: true })
  }

  const filtered = useMemo(() => applyFilters(entries.data ?? [], filters), [entries.data, filters])
  const { totalIn, totalOut } = useMemo(() => totals(filtered), [filtered])
  const period = useMemo(() => periodBalances(entries.data ?? [], filters), [entries.data, filters])

  if (ledger.isPending) return <Spinner />
  if (ledger.error) return <ErrorBox error={ledger.error} />
  if (!ledger.data) {
    return (
      <>
        <PageHeader title="Not found" back="/" />
        <p className="p-4 text-slate-500">This ledger doesn't exist or you don't have access to it.</p>
      </>
    )
  }

  const isEmpty = entries.data?.length === 0

  return (
    <>
      <PageHeader
        title={ledger.data.name}
        back="/"
        actions={
          <>
            <button
              className="btn-ghost px-2 py-1 text-sm"
              disabled={!filtered.length}
              onClick={() => exportLedgerCsv(ledger.data!.name, filtered, categories.data ?? [])}
              title="Download the entries shown as CSV"
            >
              Export
            </button>
            <Link to={`/l/${id}/settings`} className="btn-ghost px-2 py-1 text-lg" aria-label="Ledger settings">
              ⚙︎
            </Link>
          </>
        }
      />

      <main className="mx-auto max-w-3xl space-y-3 p-4 pb-32">
        <div className="grid grid-cols-2 rounded-lg bg-slate-200 p-1 text-sm font-medium" role="tablist">
          {(['entries', 'reports'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md py-1.5 capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <FilterBar
          filters={filters}
          onChange={setFilters}
          categories={categories.data ?? []}
          members={members.data ?? []}
        />
        <TotalsBar
          totalIn={totalIn}
          totalOut={totalOut}
          period={period && { ...period, from: filters.from, to: filters.to }}
        />
        <ErrorBox error={entries.error} />

        {entries.isPending ? (
          <Spinner />
        ) : isEmpty ? (
          <div className="card space-y-3 p-8 text-center text-slate-500">
            <p>No entries yet. Add one below, or bring in your CashBook data.</p>
            <Link to={`/l/${id}/import`} className="btn-secondary">
              Import CashBook CSV
            </Link>
          </div>
        ) : tab === 'reports' ? (
          <Suspense fallback={<Spinner />}>
            <ReportsView entries={filtered} categories={categories.data ?? []} />
          </Suspense>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
                {hasFilters(filters) && ` of ${entries.data!.length}`}
              </span>
              <button
                className="btn-ghost px-2 py-1"
                onClick={() => {
                  setSelecting((s) => !s)
                  setSelected(new Set())
                }}
              >
                {selecting ? 'Cancel' : 'Select'}
              </button>
            </div>
            {selecting && (
              <BulkBar
                ledgerId={id}
                visible={filtered}
                selected={selected}
                setSelected={setSelected}
                onDone={() => {
                  setSelecting(false)
                  setSelected(new Set())
                }}
              />
            )}
            <EntryList
              entries={filtered}
              limit={limit}
              categories={new Map(categories.data?.map((c) => [c.id, c.name]))}
              members={members.data ?? []}
              selecting={selecting}
              selected={selected}
              onToggle={(entryId) =>
                setSelected((s) => {
                  const next = new Set(s)
                  if (next.has(entryId)) next.delete(entryId)
                  else next.add(entryId)
                  return next
                })
              }
              onOpen={(entry) => setFormTarget({ entry })}
            />
            {filtered.length > limit && (
              <button className="btn-secondary w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Show more ({filtered.length - limit} older)
              </button>
            )}
          </>
        )}
      </main>

      {!selecting && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 p-3">
            <button className="btn bg-in py-3 text-white hover:opacity-90" onClick={() => setFormTarget({ type: 'in' })}>
              + Cash In
            </button>
            <button className="btn bg-out py-3 text-white hover:opacity-90" onClick={() => setFormTarget({ type: 'out' })}>
              − Cash Out
            </button>
          </div>
        </div>
      )}

      <EntryFormModal ledgerId={id} target={formTarget} onClose={() => setFormTarget(null)} />
    </>
  )
}

function EntryList({
  entries,
  limit,
  categories,
  members,
  selecting,
  selected,
  onToggle,
  onOpen,
}: {
  entries: EntryWithBalance[]
  limit: number
  categories: Map<string, string>
  members: { user_id: string; profile: { name: string | null; email: string } | null }[]
  selecting: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  onOpen: (e: Entry) => void
}) {
  const userId = useUserId()
  const showAuthor = members.length > 1
  const authorName = (id: string | null) => {
    if (!id) return null
    if (id === userId) return 'You'
    const p = members.find((m) => m.user_id === id)?.profile
    return p?.name?.split(' ')[0] ?? p?.email ?? null
  }

  // Newest first, grouped by day.
  const groups = useMemo(() => {
    const out: { day: string; items: EntryWithBalance[] }[] = []
    const shown = entries.slice(-limit).reverse()
    for (const e of shown) {
      const day = toDateKey(e.occurred_at)
      if (out.at(-1)?.day !== day) out.push({ day, items: [] })
      out.at(-1)!.items.push(e)
    }
    return out
  }, [entries, limit])

  if (entries.length === 0) return <div className="card p-8 text-center text-slate-500">No entries match these filters.</div>

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{formatDateKey(g.day)}</h3>
          <ul className="card divide-y divide-slate-100">
            {g.items.map((e) => {
              const category = e.category_id ? categories.get(e.category_id) : null
              const author = showAuthor ? authorName(e.created_by) : null
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 p-3 text-left hover:bg-slate-50"
                    onClick={() => (selecting ? onToggle(e.id) : onOpen(e))}
                    aria-pressed={selecting ? selected.has(e.id) : undefined}
                  >
                    {selecting && (
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-brand-600"
                        checked={selected.has(e.id)}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{e.remark || <span className="text-slate-400">No remark</span>}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{formatTime(e.occurred_at)}</span>
                        {category && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{category}</span>}
                        {author && <span>by {author}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money paise={e.amount} className={`font-semibold ${e.type === 'in' ? 'text-in' : 'text-out'}`} />
                      <div className="text-xs text-slate-500">
                        Bal <Money paise={e.balance} />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function BulkBar({
  ledgerId,
  visible,
  selected,
  setSelected,
  onDone,
}: {
  ledgerId: string
  visible: EntryWithBalance[]
  selected: Set<string>
  setSelected: (s: Set<string>) => void
  onDone: () => void
}) {
  const categories = useCategories(ledgerId)
  const invalidate = useInvalidateLedger(ledgerId)
  const [categorizing, setCategorizing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const ids = [...selected]
  const allSelected = visible.length > 0 && visible.every((e) => selected.has(e.id))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await invalidate()
      setCategorizing(false)
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card sticky top-16 z-[5] space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{ids.length} selected</span>
        <button
          className="btn-ghost px-2 py-1 text-sm"
          onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((e) => e.id)))}
        >
          {allSelected ? 'Select none' : `Select all ${visible.length}`}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary px-3 py-1.5" disabled={!ids.length || busy} onClick={() => setCategorizing(true)}>
          Set category
        </button>
        <button
          className="btn-danger px-3 py-1.5"
          disabled={!ids.length || busy}
          onClick={() => {
            if (confirm(`Delete ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}? This can't be undone.`)) {
              run(() => deleteEntries(ids))
            }
          }}
        >
          Delete
        </button>
      </div>
      <ErrorBox error={error} />

      <Modal open={categorizing} onClose={() => setCategorizing(false)} title={`Set category for ${ids.length}`}>
        <div className="space-y-2">
          <button className="btn-secondary w-full justify-start" disabled={busy} onClick={() => run(() => setEntriesCategory(ids, null))}>
            Uncategorized
          </button>
          {categories.data?.map((c) => (
            <button
              key={c.id}
              className="btn-secondary w-full justify-start"
              disabled={busy}
              onClick={() => run(() => setEntriesCategory(ids, c.id))}
            >
              {c.name}
            </button>
          ))}
          {categories.data?.length === 0 && (
            <p className="text-sm text-slate-500">No categories yet. Create them in ledger settings, or when adding an entry.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
