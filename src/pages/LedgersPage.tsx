import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signOut, useUserId } from '../auth/AuthProvider'
import { AboutModal } from '../components/AboutModal'
import { ErrorBox, Modal, Money, PageHeader, Spinner } from '../components/ui'
import { createLedger } from '../lib/api'
import { formatDate } from '../lib/dates'
import { keys, useLedgers, useMe } from '../lib/queries'
import type { LedgerSummary } from '../lib/types'

type Sort = 'recent' | 'name' | 'balance'

const SORTS: Record<Sort, { label: string; compare: (a: LedgerSummary, b: LedgerSummary) => number }> = {
  recent: {
    label: 'Recently used',
    compare: (a, b) => (b.last_entry_at ?? b.created_at).localeCompare(a.last_entry_at ?? a.created_at),
  },
  name: { label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
  balance: { label: 'Balance', compare: (a, b) => b.total_in - b.total_out - (a.total_in - a.total_out) },
}

function readSort(): Sort {
  try {
    const s = localStorage.getItem('ledgerSort')
    return s && s in SORTS ? (s as Sort) : 'recent'
  } catch {
    return 'recent'
  }
}

export function LedgersPage() {
  const ledgers = useLedgers()
  const me = useMe()
  const userId = useUserId()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>(readSort)
  const [creating, setCreating] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (ledgers.data ?? []).filter((l) => l.name.toLowerCase().includes(q)).sort(SORTS[sort].compare)
  }, [ledgers.data, search, sort])

  return (
    <>
      <PageHeader
        title="ExpenseBook"
        actions={
          <>
            <button
              className="btn-ghost size-9 rounded-full p-0 text-lg"
              onClick={() => setAboutOpen(true)}
              aria-label="About ExpenseBook"
              title="About"
            >
              ⓘ
            </button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => signOut()} title={me.data?.email}>
              Sign out
            </button>
          </>
        }
      />
      <main className="mx-auto max-w-3xl space-y-3 p-4 pb-28">
        <div className="flex gap-2">
          <input
            className="input"
            type="search"
            placeholder="Search ledgers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input w-auto"
            aria-label="Sort ledgers"
            value={sort}
            onChange={(e) => {
              const s = e.target.value as Sort
              setSort(s)
              try {
                localStorage.setItem('ledgerSort', s)
              } catch {
                /* storage unavailable: sort just isn't remembered */
              }
            }}
          >
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <ErrorBox error={ledgers.error} />
        {ledgers.isPending ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            {search ? 'No ledgers match your search.' : 'No ledgers yet. Create one to get started.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((l) => (
              <li key={l.id}>
                <Link to={`/l/${l.id}`} className="card flex items-center gap-3 p-4 hover:border-brand-600">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{l.name}</span>
                      {l.member_count > 1 && (
                        <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                          {l.owner_id === userId ? 'Shared' : 'Shared with you'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {l.entry_count} {l.entry_count === 1 ? 'entry' : 'entries'}
                      {l.last_entry_at && ` · last ${formatDate(l.last_entry_at)}`}
                    </div>
                  </div>
                  <Money paise={l.total_in - l.total_out} colored className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl justify-end px-4">
          <button className="btn-primary rounded-full px-5 py-3 shadow-lg" onClick={() => setCreating(true)}>
            + New ledger
          </button>
        </div>
      </div>

      <NewLedgerModal open={creating} onClose={() => setCreating(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}

function NewLedgerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  return (
    <Modal open={open} onClose={onClose} title="New ledger">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const { id } = await createLedger(name)
            await qc.invalidateQueries({ queryKey: keys.ledgers })
            setName('')
            onClose()
            navigate(`/l/${id}`)
          } catch (err) {
            setError(err)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div>
          <label className="label" htmlFor="ledger-name">
            Name
          </label>
          <input
            id="ledger-name"
            className="input"
            autoFocus
            required
            maxLength={100}
            placeholder="e.g. Papa – Household"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <ErrorBox error={error} />
        <button className="btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create ledger'}
        </button>
      </form>
    </Modal>
  )
}
