import { describe, expect, it } from 'vitest'
import { periodBalances, readFilters } from './filters'
import { withBalances } from './queries'
import type { Entry } from './types'

const entry = (occurred_at: string, type: 'in' | 'out', amount: number): Entry => ({
  id: occurred_at,
  ledger_id: 'l',
  type,
  amount,
  occurred_at,
  remark: '',
  category_id: null,
  created_by: null,
  created_at: occurred_at,
})

// IST dates: 31 Jul 23:30 IST is 18:00 UTC on 31 Jul; 01 Aug 00:30 IST is 19:00 UTC on 31 Jul.
const ledger = withBalances([
  entry('2026-07-10T04:00:00Z', 'in', 100000), // 10 Jul: +1000 → 1000
  entry('2026-07-31T18:00:00Z', 'out', 20000), // 31 Jul 23:30 IST: -200 → 800
  entry('2026-07-31T19:00:00Z', 'out', 5000), // 01 Aug 00:30 IST: -50 → 750
  entry('2026-08-20T04:00:00Z', 'in', 10000), // 20 Aug: +100 → 850
  entry('2026-09-05T04:00:00Z', 'out', 30000), // 05 Sep: -300 → 550
])
const f = (q: string) => readFilters(new URLSearchParams(q))

describe('periodBalances', () => {
  it('is null without a start date', () => {
    expect(periodBalances(ledger, f(''))).toBeNull()
    expect(periodBalances(ledger, f('to=2026-08-31'))).toBeNull()
  })

  it('uses IST day boundaries for opening and closing', () => {
    expect(periodBalances(ledger, f('from=2026-08-01&to=2026-08-31'))).toEqual({ opening: 80000, closing: 85000 })
  })

  it('closes at the latest balance when there is no end date', () => {
    expect(periodBalances(ledger, f('from=2026-08-01'))).toEqual({ opening: 80000, closing: 55000 })
  })

  it('opens at zero before the first entry', () => {
    expect(periodBalances(ledger, f('from=2026-01-01&to=2026-07-10'))).toEqual({ opening: 0, closing: 100000 })
  })

  it('ignores non-date filters (balances are for the whole ledger)', () => {
    expect(periodBalances(ledger, f('from=2026-08-01&to=2026-08-31&type=in&q=xyz'))).toEqual({
      opening: 80000,
      closing: 85000,
    })
  })
})
