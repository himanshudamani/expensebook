import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonthKey, toMonthKey } from '../lib/dates'
import { formatMoney } from '../lib/money'
import type { Category, EntryType, EntryWithBalance } from '../lib/types'
import { Money } from './ui'

// Chart marks only; text stays in slate ink. Validated for colour-blind separation.
const IN_COLOR = '#059669'
const OUT_COLOR = '#dc2626'

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

type Props = { entries: EntryWithBalance[]; categories: Category[] }

export default function ReportsView({ entries, categories }: Props) {
  return (
    <div className="space-y-4">
      <MonthlyChart entries={entries} />
      <CategoryBreakdown entries={entries} categories={categories} />
    </div>
  )
}

function MonthlyChart({ entries }: { entries: EntryWithBalance[] }) {
  const [showTable, setShowTable] = useState(false)
  const months = useMemo(() => {
    const byMonth = new Map<string, { in: number; out: number }>()
    for (const e of entries) {
      const k = toMonthKey(e.occurred_at)
      const m = byMonth.get(k) ?? { in: 0, out: 0 }
      m[e.type] += e.amount
      byMonth.set(k, m)
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, m]) => ({ key, label: formatMonthKey(key), in: m.in / 100, out: m.out / 100, net: m.in - m.out }))
  }, [entries])

  // Keep the chart readable on a phone: last 12 months; the table has everything.
  const recent = months.slice(-12)

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Monthly In vs Out</h2>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">In</th>
                <th className="py-1 text-right font-medium">Out</th>
                <th className="py-1 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...months].reverse().map((m) => (
                <tr key={m.key}>
                  <td className="py-1.5">{m.label}</td>
                  <td className="py-1.5 text-right">
                    <Money paise={Math.round(m.in * 100)} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money paise={Math.round(m.out * 100)} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Money paise={m.net} colored />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {months.length > 12 && <p className="mb-2 text-xs text-slate-500">Last 12 of {months.length} months</p>}
          <div className="h-64" role="img" aria-label="Bar chart of cash in and cash out per month">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recent} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tickFormatter={(l: string) => l.slice(0, 3)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis
                  tickFormatter={(v: number) => compact.format(v)}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  formatter={(v, name) => [formatMoney(Math.round(Number(v) * 100)), name]}
                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => <span style={{ color: '#334155' }}>{value}</span>}
                />
                <Bar dataKey="in" name="Cash In" fill={IN_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="out" name="Cash Out" fill={OUT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  )
}

function CategoryBreakdown({ entries, categories }: Props) {
  const [type, setType] = useState<EntryType>('out')
  const rows = useMemo(() => {
    const names = new Map(categories.map((c) => [c.id, c.name]))
    const sums = new Map<string, { name: string; amount: number; count: number }>()
    for (const e of entries) {
      if (e.type !== type) continue
      const key = e.category_id ?? ''
      const row = sums.get(key) ?? { name: names.get(key) ?? 'Uncategorized', amount: 0, count: 0 }
      row.amount += e.amount
      row.count += 1
      sums.set(key, row)
    }
    return [...sums.values()].sort((a, b) => b.amount - a.amount)
  }, [entries, categories, type])

  const total = rows.reduce((s, r) => s + r.amount, 0)
  const max = rows[0]?.amount ?? 0
  const color = type === 'in' ? IN_COLOR : OUT_COLOR

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">By category</h2>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="radiogroup" aria-label="Breakdown type">
          {(['out', 'in'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={`rounded-md px-3 py-1 ${type === t ? 'bg-white shadow-sm' : 'text-slate-600'}`}
            >
              {t === 'out' ? 'Cash Out' : 'Cash In'}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No {type === 'out' ? 'cash out' : 'cash in'} entries here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.name} title={`${r.count} entries`}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">
                  {r.name} <span className="text-xs text-slate-500">· {r.count}</span>
                </span>
                <span className="shrink-0">
                  <Money paise={r.amount} className="font-medium" />{' '}
                  <span className="text-xs text-slate-500 tabular">{Math.round((r.amount / total) * 100)}%</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full" style={{ width: `${(r.amount / max) * 100}%`, backgroundColor: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
