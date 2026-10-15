import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCashbookCsv, splitDuplicates, toCashbookCsv } from './cashbookCsv'

const HEADER = '"Date","Time","Remark","Category","Cash In","Cash Out","Balance"'

describe('parseCashbookCsv', () => {
  it('parses a CashBook export', () => {
    const csv = [
      HEADER,
      '"01 Apr 2026","07:33 AM","Salary","","30000","","30000"',
      '"05 Apr 2026","12:41 PM","Rashan - Feb’26","Groceries","","1975.39","28024.61"',
      '"05 Apr 2026","12:00 AM","Midnight","","","1","28023.61"',
    ].join('\n')
    const { rows, errors, balanceCheck } = parseCashbookCsv(csv)

    expect(errors).toEqual([])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ type: 'in', amount: 3000000, remark: 'Salary', category: '' })
    // 07:33 IST is 02:03 UTC
    expect(rows[0].occurred_at).toBe('2026-04-01T02:03:00.000Z')
    expect(rows[1]).toMatchObject({ type: 'out', amount: 197539, category: 'Groceries' })
    expect(rows[2].occurred_at).toBe('2026-04-04T18:30:00.000Z')
    expect(balanceCheck).toEqual({ openingBalance: 0, mismatches: [] })
  })

  it('reports the implied opening balance of a partial export', () => {
    const csv = [HEADER, '"01 Apr 2026","07:33 AM","Salary","","30000","","24472.31"'].join('\n')
    expect(parseCashbookCsv(csv).balanceCheck?.openingBalance).toBe(-552769)
  })

  it('flags balance mismatches without cascading', () => {
    const csv = [
      HEADER,
      '"01 Apr 2026","07:33 AM","a","","100","","100"',
      '"02 Apr 2026","07:33 AM","b","","","10","95"',
      '"03 Apr 2026","07:33 AM","c","","","5","90"',
    ].join('\n')
    expect(parseCashbookCsv(csv).balanceCheck?.mismatches).toEqual([{ line: 3, expected: 9000, actual: 9500 }])
  })

  it('reports bad rows and keeps good ones', () => {
    const csv = [
      HEADER,
      '"31 Feb 2026","07:33 AM","bad date","","1","",""',
      '"01 Apr 2026","07:33 AM","both","","1","2",""',
      '"01 Apr 2026","07:33 AM","none","","","",""',
      '"01 Apr 2026","07:33 AM","bad amount","","abc","",""',
      '"01 Apr 2026","","no time","","5","",""',
    ].join('\n')
    const { rows, errors } = parseCashbookCsv(csv)
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5])
    expect(rows.map((r) => r.remark)).toEqual(['no time'])
  })

  it('rejects files without the CashBook columns', () => {
    const { rows, errors } = parseCashbookCsv('a,b\n1,2')
    expect(rows).toEqual([])
    expect(errors[0].message).toMatch(/Missing column/)
  })

  it('handles a BOM, CRLF and remarks with commas and quotes', () => {
    const csv = '﻿' + [HEADER, '"01 Apr 2026","07:33 AM","Tea, ""special""","","","20",""'].join('\r\n')
    const { rows, errors } = parseCashbookCsv(csv)
    expect(errors).toEqual([])
    expect(rows[0].remark).toBe('Tea, "special"')
  })
})

describe('splitDuplicates', () => {
  const row = (remark: string, line: number) => ({
    line,
    type: 'out' as const,
    amount: 2000,
    occurred_at: '2026-04-01T02:03:00.000Z',
    remark,
    category: '',
    balance: null,
  })

  it('skips rows already in the ledger, counting identical entries', () => {
    const rows = [row('Tea', 2), row('Tea', 3), row('Milk', 4)]
    const existing = [{ ...row('Tea', 0), occurred_at: '2026-04-01T07:33:00+05:30' }]
    const { fresh, duplicates } = splitDuplicates(rows, existing)
    expect(duplicates.map((r) => r.line)).toEqual([2])
    expect(fresh.map((r) => r.line)).toEqual([3, 4])
  })
})

describe('toCashbookCsv', () => {
  it('round-trips through the parser', () => {
    const csv = toCashbookCsv([
      { occurred_at: '2026-04-01T02:03:00.000Z', type: 'in', amount: 3000000, remark: 'Salary, April', category: 'Income', balance: 3000000 },
      { occurred_at: '2026-04-05T07:11:00.000Z', type: 'out', amount: 197539, remark: 'Rashan', category: '', balance: 2802461 },
    ])
    expect(csv.split('\n')[1]).toBe('"01 Apr 2026","07:33 AM","Salary, April","Income","30000","","30000"')
    expect(csv.split('\n')[2]).toBe('"05 Apr 2026","12:41 PM","Rashan","","","1975.39","28024.61"')

    const { rows, errors, balanceCheck } = parseCashbookCsv(csv)
    expect(errors).toEqual([])
    expect(rows.map((r) => r.amount)).toEqual([3000000, 197539])
    expect(balanceCheck).toEqual({ openingBalance: 0, mismatches: [] })
  })
})

// Runs against a real CashBook export if one is in the project root locally.
// CSVs are gitignored, so this is skipped in CI.
const localExport = readdirSync('.').find((f) => f.endsWith('@CashBook.csv'))
describe.skipIf(!localExport || !existsSync(localExport))('local CashBook export', () => {
  it('parses every row and the balances agree', () => {
    const { rows, errors, balanceCheck } = parseCashbookCsv(readFileSync(localExport!, 'utf8'))
    expect(errors).toEqual([])
    expect(rows.length).toBeGreaterThan(0)
    expect(balanceCheck?.mismatches).toEqual([])
  })
})
