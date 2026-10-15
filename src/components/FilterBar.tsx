import { useEffect, useState } from 'react'
import { formatDateKey } from '../lib/dates'
import { datePresets, hasFilters, UNCATEGORIZED, type Filters } from '../lib/filters'
import type { Category, Member } from '../lib/types'

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  categories: Category[]
  members: Member[]
}

export function FilterBar({ filters, onChange, categories, members }: Props) {
  const [open, setOpen] = useState(false)
  // Search updates the URL after a short pause rather than on every keystroke.
  const [q, setQ] = useState(filters.q)
  // Follow outside changes to the search (e.g. "Clear all", Back button).
  const [prevQ, setPrevQ] = useState(filters.q)
  if (filters.q !== prevQ) {
    setPrevQ(filters.q)
    setQ(filters.q)
  }
  useEffect(() => {
    if (q === filters.q) return
    const t = setTimeout(() => onChange({ ...filters, q }), 250)
    return () => clearTimeout(t)
  }, [q, filters, onChange])

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const presets = datePresets()
  const activePreset = presets.find((p) => p.from === filters.from && p.to === filters.to)

  const chips: { label: string; clear: Partial<Filters> }[] = []
  if (filters.from || filters.to) {
    chips.push({
      label:
        activePreset?.label ??
        `${filters.from ? formatDateKey(filters.from) : '…'} – ${filters.to ? formatDateKey(filters.to) : '…'}`,
      clear: { from: '', to: '' },
    })
  }
  if (filters.type) chips.push({ label: filters.type === 'in' ? 'Cash In' : 'Cash Out', clear: { type: '' } })
  if (filters.category) {
    chips.push({
      label:
        filters.category === UNCATEGORIZED
          ? 'Uncategorized'
          : (categories.find((c) => c.id === filters.category)?.name ?? 'Category'),
      clear: { category: '' },
    })
  }
  if (filters.member) {
    const m = members.find((m) => m.user_id === filters.member)
    chips.push({ label: `By ${m?.profile?.name ?? m?.profile?.email ?? 'member'}`, clear: { member: '' } })
  }
  const activeCount = chips.length

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input"
          type="search"
          placeholder="Search remarks"
          aria-label="Search remarks"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={`btn shrink-0 border whitespace-nowrap ${open || activeCount ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700'}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          Filters{activeCount > 0 && ` (${activeCount})`}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => set(c.clear)}
              className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} ✕
            </button>
          ))}
          {hasFilters(filters) && (
            <button
              type="button"
              className="px-2 py-1 text-xs text-slate-500 underline"
              onClick={() => {
                setQ('')
                onChange({ from: '', to: '', type: '', category: '', member: '', q: '' })
              }}
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="card space-y-4 p-4">
          <fieldset>
            <legend className="label">Date</legend>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set({ from: p.from, to: p.to })}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    activePreset === p ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                From
                <input
                  className="input mt-0.5"
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => set({ from: e.target.value })}
                />
              </label>
              <label className="text-xs text-slate-500">
                To
                <input
                  className="input mt-0.5"
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(e) => set({ to: e.target.value })}
                />
              </label>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Type
              <select
                className="input mt-0.5"
                value={filters.type}
                onChange={(e) => set({ type: e.target.value as Filters['type'] })}
              >
                <option value="">In & Out</option>
                <option value="in">Cash In</option>
                <option value="out">Cash Out</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Category
              <select className="input mt-0.5" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
                <option value="">All categories</option>
                <option value={UNCATEGORIZED}>Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {members.length > 1 && (
              <label className="col-span-2 text-xs text-slate-500">
                Added by
                <select className="input mt-0.5" value={filters.member} onChange={(e) => set({ member: e.target.value })}>
                  <option value="">Anyone</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profile?.name ?? m.profile?.email}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button type="button" className="btn-secondary w-full" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}
