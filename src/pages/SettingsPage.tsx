import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useUserId } from '../auth/AuthProvider'
import { ErrorBox, PageHeader, Spinner } from '../components/ui'
import * as api from '../lib/api'
import { exportLedgerCsv } from '../lib/download'
import { keys, useCategories, useEntriesWithBalance, useInvalidateLedger, useLedger, useMembers } from '../lib/queries'

export default function SettingsPage() {
  const { id = '' } = useParams()
  const ledger = useLedger(id)
  const userId = useUserId()

  if (ledger.isPending) return <Spinner />
  if (!ledger.data) return <ErrorBox error={ledger.error ?? 'Ledger not found'} />
  const isOwner = ledger.data.owner_id === userId

  return (
    <>
      <PageHeader title="Ledger settings" back={`/l/${id}`} />
      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
        {isOwner && <RenameSection id={id} name={ledger.data.name} />}
        <MembersSection id={id} isOwner={isOwner} />
        <CategoriesSection id={id} />
        <DataSection id={id} name={ledger.data.name} />
        <DangerSection id={id} name={ledger.data.name} isOwner={isOwner} />
      </main>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Small helper for the busy/error state every action here needs. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function RenameSection({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name)
  const { busy, error, run } = useAction()
  const qc = useQueryClient()

  return (
    <Section title="Name">
      <form
        className="flex gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          run(async () => {
            await api.renameLedger(id, value)
            await Promise.all([
              qc.invalidateQueries({ queryKey: keys.ledger(id) }),
              qc.invalidateQueries({ queryKey: keys.ledgers }),
            ])
          })
        }}
      >
        <input className="input" aria-label="Ledger name" maxLength={100} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-primary" disabled={busy || !value.trim() || value.trim() === name}>
          Save
        </button>
      </form>
      <ErrorBox error={error} />
    </Section>
  )
}

function MembersSection({ id, isOwner }: { id: string; isOwner: boolean }) {
  const members = useMembers(id)
  const userId = useUserId()
  const [email, setEmail] = useState('')
  const { busy, error, run } = useAction()
  const qc = useQueryClient()
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: keys.members(id) }), qc.invalidateQueries({ queryKey: keys.ledgers })])

  return (
    <Section title="Shared with">
      <ul className="divide-y divide-slate-100">
        {members.data?.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.profile?.name ?? m.profile?.email}
                {m.user_id === userId && ' (you)'}
              </div>
              <div className="truncate text-xs text-slate-500">
                {m.profile?.email} · {m.role === 'owner' ? 'Owner' : 'Can add & edit entries'}
              </div>
            </div>
            {isOwner && m.role !== 'owner' && (
              <button
                className="btn-ghost px-2 py-1 text-xs text-out"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Remove ${m.profile?.email} from this ledger?`)) run(() => api.removeMember(id, m.user_id).then(refresh))
                }}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => api.addMember(id, email).then(refresh))) setEmail('')
          }}
        >
          <div className="flex gap-2">
            <input
              className="input"
              type="email"
              required
              placeholder="Their Google email"
              aria-label="Email to share with"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={busy}>
              Share
            </button>
          </div>
          <p className="text-xs text-slate-500">They need to sign in to ExpenseBook once before you can add them.</p>
        </form>
      )}
      <ErrorBox error={error} />
    </Section>
  )
}

function CategoriesSection({ id }: { id: string }) {
  const categories = useCategories(id)
  const entries = useEntriesWithBalance(id)
  const invalidate = useInvalidateLedger(id)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const { busy, error, run } = useAction()

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries.data ?? []) if (e.category_id) m.set(e.category_id, (m.get(e.category_id) ?? 0) + 1)
    return m
  }, [entries.data])

  return (
    <Section title="Categories">
      {categories.data?.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
      <ul className="divide-y divide-slate-100">
        {categories.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            {editing?.id === c.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (await run(() => api.renameCategory(c.id, editing.name).then(invalidate))) setEditing(null)
                }}
              >
                <input
                  className="input py-1.5"
                  autoFocus
                  aria-label="Category name"
                  maxLength={60}
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                />
                <button className="btn-primary px-3 py-1.5" disabled={busy || !editing.name.trim()}>
                  Save
                </button>
                <button type="button" className="btn-ghost px-2 py-1.5" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1 text-sm">
                  {c.name} <span className="text-xs text-slate-500">· {counts.get(c.id) ?? 0}</span>
                </span>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({ id: c.id, name: c.name })}>
                  Rename
                </button>
                <button
                  className="btn-ghost px-2 py-1 text-xs text-out"
                  disabled={busy}
                  onClick={() => {
                    const n = counts.get(c.id) ?? 0
                    if (confirm(`Delete "${c.name}"?${n ? ` Its ${n} entries become Uncategorized.` : ''}`)) {
                      run(() => api.deleteCategory(c.id).then(invalidate))
                    }
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => api.createCategory(id, newName).then(invalidate))) setNewName('')
        }}
      >
        <input
          className="input"
          placeholder="New category"
          aria-label="New category name"
          maxLength={60}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn-secondary shrink-0" disabled={busy || !newName.trim()}>
          Add
        </button>
      </form>
      <ErrorBox error={error} />
    </Section>
  )
}

function DataSection({ id, name }: { id: string; name: string }) {
  const entries = useEntriesWithBalance(id)
  const categories = useCategories(id)
  return (
    <Section title="Import & export">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to={`/l/${id}/import`} className="btn-secondary">
          Import CashBook CSV
        </Link>
        <button
          className="btn-secondary"
          disabled={!entries.data?.length}
          onClick={() => exportLedgerCsv(name, entries.data!, categories.data ?? [])}
        >
          Export all entries (CSV)
        </button>
      </div>
      <p className="text-xs text-slate-500">
        To export a filtered set, apply filters on the ledger and use Export there. Exports are a good backup: Supabase's free
        plan doesn't keep backups you can download.
      </p>
    </Section>
  )
}

function DangerSection({ id, name, isOwner }: { id: string; name: string; isOwner: boolean }) {
  const userId = useUserId()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { busy, error, run } = useAction()

  const leaveOrDelete = async () => {
    if (isOwner) {
      const typed = prompt(`This permanently deletes "${name}" and all its entries for everyone.\n\nType the ledger name to confirm:`)
      if (typed?.trim() !== name.trim()) return
    } else if (!confirm(`Leave "${name}"? You'll lose access until the owner adds you again.`)) {
      return
    }
    const ok = await run(() => (isOwner ? api.deleteLedger(id) : api.removeMember(id, userId)))
    if (ok) {
      await qc.invalidateQueries({ queryKey: keys.ledgers })
      navigate('/', { replace: true })
    }
  }

  return (
    <Section title={isOwner ? 'Delete ledger' : 'Leave ledger'}>
      <button className="btn-danger w-full" disabled={busy} onClick={leaveOrDelete}>
        {isOwner ? 'Delete this ledger' : 'Leave this ledger'}
      </button>
      <ErrorBox error={error} />
    </Section>
  )
}
