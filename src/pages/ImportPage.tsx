import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBox, Money, PageHeader, Spinner } from '../components/ui'
import { ensureCategories, importEntries } from '../lib/api'
import { parseCashbookCsv, splitDuplicates, type ParseResult } from '../lib/cashbookCsv'
import { formatDate, formatTime } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { useCategories, useEntries, useInvalidateLedger, useLedger } from '../lib/queries'

export default function ImportPage() {
  const { id = '' } = useParams()
  const ledger = useLedger(id)
  const existing = useEntries(id)
  const categories = useCategories(id)
  const invalidate = useInvalidateLedger(id)

  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)

  const plan = useMemo(() => {
    if (!parsed || !existing.data) return null
    const { fresh, duplicates } = splitDuplicates(parsed.rows, existing.data)
    const known = new Set(categories.data?.map((c) => c.name.toLowerCase()))
    const newCategories = [
      ...new Map(
        fresh.map((r) => r.category.trim()).filter((c) => c && !known.has(c.toLowerCase())).map((c) => [c.toLowerCase(), c]),
      ).values(),
    ]
    return { fresh, duplicates, newCategories }
  }, [parsed, existing.data, categories.data])

  async function onFile(file: File) {
    setError(null)
    setDone(null)
    setFileName(file.name)
    try {
      setParsed(parseCashbookCsv(await file.text()))
    } catch (e) {
      setParsed(null)
      setError(e)
    }
  }

  async function runImport() {
    if (!plan) return
    setError(null)
    setProgress(0)
    try {
      const ids = await ensureCategories(
        id,
        plan.fresh.map((r) => r.category),
      )
      await importEntries(
        id,
        plan.fresh.map((r) => ({
          type: r.type,
          amount: r.amount,
          occurred_at: r.occurred_at,
          remark: r.remark,
          category_id: r.category ? (ids.get(r.category.trim().toLowerCase()) ?? null) : null,
        })),
        setProgress,
      )
      setDone(plan.fresh.length)
      setParsed(null)
    } catch (e) {
      setError(e)
    } finally {
      await invalidate()
      setProgress(null)
    }
  }

  if (ledger.isPending || existing.isPending) return <Spinner />

  const check = parsed?.balanceCheck
  const importing = progress !== null

  return (
    <>
      <PageHeader title="Import CashBook CSV" back={`/l/${id}`} />
      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
        <p className="text-sm text-slate-600">
          Into <strong>{ledger.data?.name}</strong>. In CashBook, open the book → <em>Reports</em> → <em>All Entries</em> →
          download as CSV/Excel with no date filter, then choose the file here. Entries already in this ledger are skipped, so
          importing the same file twice is safe.
        </p>

        <label className="card flex cursor-pointer flex-col items-center gap-2 border-dashed p-6 text-center hover:border-brand-600">
          <span className="font-medium">{fileName || 'Choose CSV file'}</span>
          <span className="text-xs text-slate-500">The file is read on this device. Only the entries are uploaded.</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
        </label>

        <ErrorBox error={error} />

        {done !== null && (
          <div className="rounded-lg border border-emerald-200 bg-in-bg p-4 text-in" role="status">
            ✓ Imported {done} {done === 1 ? 'entry' : 'entries'}.{' '}
            <Link to={`/l/${id}`} className="font-semibold underline">
              View ledger
            </Link>
          </div>
        )}

        {parsed && plan && (
          <>
            <div className="card grid grid-cols-3 divide-x divide-slate-200 text-center">
              <Stat label="To import" value={plan.fresh.length} tone="text-in" />
              <Stat label="Already here" value={plan.duplicates.length} />
              <Stat label="Errors" value={parsed.errors.length} tone={parsed.errors.length ? 'text-out' : ''} />
            </div>

            {check && check.openingBalance !== 0 && (
              <Warning>
                This file doesn't start from the beginning of the book: its first balance implies an opening balance of{' '}
                <strong>{formatMoney(check.openingBalance)}</strong>. Balances here will differ from CashBook unless you export
                the full history (no date filter).
              </Warning>
            )}
            {check && check.mismatches.length > 0 && (
              <Warning>
                {check.mismatches.length} row(s) have a Balance that doesn't match the running total (first at line{' '}
                {check.mismatches[0].line}: expected {formatMoney(check.mismatches[0].expected)}, file says{' '}
                {formatMoney(check.mismatches[0].actual)}). Some entries may be missing from the file.
              </Warning>
            )}
            {check && check.openingBalance === 0 && check.mismatches.length === 0 && parsed.rows.length > 0 && (
              <p className="text-sm text-in">✓ Running balances in the file all check out.</p>
            )}

            {plan.newCategories.length > 0 && (
              <p className="text-sm text-slate-600">
                New categories to create: {plan.newCategories.join(', ')}. Rows without a category stay Uncategorized.
              </p>
            )}

            {parsed.errors.length > 0 && (
              <details className="card p-3 text-sm" open={parsed.rows.length === 0}>
                <summary className="cursor-pointer font-medium text-out">
                  {parsed.errors.length} row(s) can't be imported and will be skipped
                </summary>
                <ul className="mt-2 space-y-1 text-slate-600">
                  {parsed.errors.slice(0, 50).map((e) => (
                    <li key={e.line}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                  {parsed.errors.length > 50 && <li>…and {parsed.errors.length - 50} more</li>}
                </ul>
              </details>
            )}

            {plan.fresh.length > 0 && (
              <section className="card overflow-hidden">
                <h2 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold">
                  Preview (first {Math.min(5, plan.fresh.length)} of {plan.fresh.length})
                </h2>
                <ul className="divide-y divide-slate-100 text-sm">
                  {plan.fresh.slice(0, 5).map((r) => (
                    <li key={r.line} className="flex justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate">{r.remark || '—'}</div>
                        <div className="text-xs text-slate-500">
                          {formatDate(r.occurred_at)} {formatTime(r.occurred_at)}
                          {r.category && ` · ${r.category}`}
                        </div>
                      </div>
                      <Money paise={r.amount} className={`shrink-0 ${r.type === 'in' ? 'text-in' : 'text-out'}`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button className="btn-primary w-full py-3" disabled={!plan.fresh.length || importing} onClick={runImport}>
              {importing
                ? `Importing… ${progress}/${plan.fresh.length}`
                : plan.fresh.length
                  ? `Import ${plan.fresh.length} ${plan.fresh.length === 1 ? 'entry' : 'entries'}`
                  : 'Nothing new to import'}
            </button>
          </>
        )}
      </main>
    </>
  )
}

function Stat({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="p-3">
      <div className={`text-xl font-semibold tabular ${tone}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      ⚠ {children}
    </div>
  )
}
