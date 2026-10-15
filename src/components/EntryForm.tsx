import { useState } from 'react'
import { createCategory, createEntry, deleteEntries, updateEntry } from '../lib/api'
import { fromLocalInput, toLocalInput } from '../lib/dates'
import { formatAmount, parseAmount } from '../lib/money'
import { useCategories, useInvalidateLedger } from '../lib/queries'
import type { Entry, EntryType } from '../lib/types'
import { ErrorBox, Modal } from './ui'

const NEW_CATEGORY = '__new__'

type Props = {
  ledgerId: string
  /** Set to open: a type for a new entry, or an existing entry to edit. */
  target: { type: EntryType } | { entry: Entry } | null
  onClose: () => void
}

export function EntryFormModal({ ledgerId, target, onClose }: Props) {
  const title = !target ? '' : 'entry' in target ? 'Edit entry' : target.type === 'in' ? 'Cash In' : 'Cash Out'
  return (
    <Modal open={target !== null} onClose={onClose} title={title}>
      {target && (
        <EntryForm
          // Remount per target so the form resets cleanly.
          key={'entry' in target ? target.entry.id : target.type}
          ledgerId={ledgerId}
          target={target}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}

function EntryForm({ ledgerId, target, onClose }: Props & { target: NonNullable<Props['target']> }) {
  const editing = 'entry' in target ? target.entry : null
  const categories = useCategories(ledgerId)
  const invalidate = useInvalidateLedger(ledgerId)

  const [type, setType] = useState<EntryType>(editing?.type ?? ('type' in target ? target.type : 'out'))
  const [amount, setAmount] = useState(editing ? formatAmount(editing.amount).replace(/,/g, '') : '')
  const [when, setWhen] = useState(() => toLocalInput(editing?.occurred_at ?? new Date()))
  const [remark, setRemark] = useState(editing?.remark ?? '')
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? '')
  const [newCategory, setNewCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [savedCount, setSavedCount] = useState(0)

  const paise = parseAmount(amount)
  const valid = paise !== null && paise > 0 && when !== '' && (categoryId !== NEW_CATEGORY || newCategory.trim() !== '')

  async function save(addAnother: boolean) {
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      let category_id: string | null = categoryId || null
      if (categoryId === NEW_CATEGORY) {
        const existing = categories.data?.find((c) => c.name.toLowerCase() === newCategory.trim().toLowerCase())
        category_id = existing ? existing.id : (await createCategory(ledgerId, newCategory)).id
      }
      const input = { type, amount: paise!, occurred_at: fromLocalInput(when), remark, category_id }
      if (editing) await updateEntry(editing.id, input)
      else await createEntry(ledgerId, input)
      await invalidate()

      if (addAnother) {
        setAmount('')
        setRemark('')
        setWhen(toLocalInput(new Date()))
        if (category_id) setCategoryId(category_id)
        setNewCategory('')
        setSavedCount((n) => n + 1)
      } else {
        onClose()
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing || !confirm('Delete this entry?')) return
    setBusy(true)
    try {
      await deleteEntries([editing.id])
      await invalidate()
      onClose()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save(false)
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Entry type">
        {(['in', 'out'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={`btn border ${
              type === t
                ? t === 'in'
                  ? 'border-in bg-in-bg text-in'
                  : 'border-out bg-out-bg text-out'
                : 'border-slate-300 bg-white text-slate-600'
            }`}
          >
            {t === 'in' ? '+ Cash In' : '− Cash Out'}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="amount">
          Amount (₹)
        </label>
        <input
          id="amount"
          className="input tabular text-lg"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={!editing}
          required
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={amount !== '' && paise === null}
        />
        {amount !== '' && paise === null && <p className="mt-1 text-xs text-out">Enter a number with up to 2 decimals.</p>}
      </div>

      <div>
        <label className="label" htmlFor="remark">
          Remark
        </label>
        <input
          id="remark"
          className="input"
          maxLength={500}
          placeholder="What was it for?"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="when">
            Date & time
          </label>
          <input
            id="when"
            className="input"
            type="datetime-local"
            required
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select id="category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NEW_CATEGORY}>+ New category…</option>
          </select>
        </div>
      </div>

      {categoryId === NEW_CATEGORY && (
        <div>
          <label className="label" htmlFor="new-category">
            New category name
          </label>
          <input
            id="new-category"
            className="input"
            autoFocus
            maxLength={60}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
        </div>
      )}

      <ErrorBox error={error} />
      {savedCount > 0 && !editing && (
        <p className="text-sm text-in" role="status">
          ✓ Saved {savedCount} {savedCount === 1 ? 'entry' : 'entries'}
        </p>
      )}

      <div className="flex gap-2">
        {editing ? (
          <button type="button" className="btn-secondary text-out" onClick={remove} disabled={busy}>
            Delete
          </button>
        ) : (
          <button type="button" className="btn-secondary flex-1" onClick={() => save(true)} disabled={busy || !valid}>
            Save & add new
          </button>
        )}
        <button type="submit" className="btn-primary flex-1" disabled={busy || !valid}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
