// Reads and writes the CSV format exported by the CashBook app:
//
//   "Date","Time","Remark","Category","Cash In","Cash Out","Balance"
//   "01 Apr 2026","07:33 AM","Salary","","30000","","24472.31"
//
// Export uses the same format, so files round-trip between the two apps.

import Papa from 'papaparse'
import { formatDate, formatTime, parseCashbookDateTime } from './dates'
import { formatAmount, parseAmount } from './money'
import type { EntryType } from './types'

export type ParsedRow = {
  /** 1-based line number in the file (header is line 1). */
  line: number
  type: EntryType
  amount: number
  occurred_at: string
  remark: string
  category: string
  /** Balance column as written by CashBook, if present. */
  balance: number | null
}

export type RowError = { line: number; message: string }

export type BalanceCheck = {
  /** Balance before the first row, implied by the file. 0 for a full export. */
  openingBalance: number
  /** Rows whose Balance column disagrees with the running total. */
  mismatches: { line: number; expected: number; actual: number }[]
}

export type ParseResult = {
  rows: ParsedRow[]
  errors: RowError[]
  /** Null when the file has no Balance column or no valid rows. */
  balanceCheck: BalanceCheck | null
}

const COLUMNS = {
  date: 'date',
  time: 'time',
  remark: 'remark',
  category: 'category',
  cashIn: 'cash in',
  cashOut: 'cash out',
  balance: 'balance',
} as const

const REQUIRED = [COLUMNS.date, COLUMNS.cashIn, COLUMNS.cashOut]

const normalizeHeader = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase()

export function parseCashbookCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  })

  const headers = parsed.meta.fields ?? []
  const missing = REQUIRED.filter((c) => !headers.includes(c))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `Missing column(s): ${missing.join(', ')}. Expected a CashBook export with Date, Time, Remark, Category, Cash In, Cash Out, Balance.`,
        },
      ],
      balanceCheck: null,
    }
  }
  const hasBalance = headers.includes(COLUMNS.balance)

  const rows: ParsedRow[] = []
  const errors: RowError[] = []

  parsed.data.forEach((raw, i) => {
    const line = i + 2
    const get = (col: string) => (raw[col] ?? '').trim()

    const occurred_at = parseCashbookDateTime(get(COLUMNS.date), get(COLUMNS.time))
    if (!occurred_at) {
      errors.push({ line, message: `Can't read date/time "${get(COLUMNS.date)} ${get(COLUMNS.time)}"` })
      return
    }

    const inText = get(COLUMNS.cashIn)
    const outText = get(COLUMNS.cashOut)
    const cashIn = parseAmount(inText)
    const cashOut = parseAmount(outText)
    if ((inText && cashIn === null) || (outText && cashOut === null)) {
      errors.push({ line, message: `Can't read amount "${inText || outText}"` })
      return
    }
    // CashBook never writes both, but a hand-edited file might.
    const hasIn = cashIn !== null && cashIn > 0
    const hasOut = cashOut !== null && cashOut > 0
    if (hasIn === hasOut) {
      errors.push({
        line,
        message: hasIn ? 'Row has both Cash In and Cash Out' : 'Row has no Cash In or Cash Out amount',
      })
      return
    }

    let balance: number | null = null
    if (hasBalance && get(COLUMNS.balance) !== '') {
      // Balance can be negative, which parseAmount doesn't accept.
      const b = get(COLUMNS.balance)
      const negative = b.startsWith('-')
      const abs = parseAmount(negative ? b.slice(1) : b)
      balance = abs === null ? null : negative ? -abs : abs
    }

    rows.push({
      line,
      type: hasIn ? 'in' : 'out',
      amount: hasIn ? cashIn! : cashOut!,
      occurred_at,
      remark: get(COLUMNS.remark),
      category: get(COLUMNS.category),
      balance,
    })
  })

  return { rows, errors, balanceCheck: hasBalance ? checkBalances(rows) : null }
}

/**
 * Replays the rows in file order and compares against CashBook's Balance
 * column. A non-zero opening balance means the export doesn't start at the
 * ledger's first entry (e.g. it was filtered by date).
 */
function checkBalances(rows: ParsedRow[]): BalanceCheck | null {
  const first = rows.find((r) => r.balance !== null)
  if (!first) return null

  const signed = (r: ParsedRow) => (r.type === 'in' ? r.amount : -r.amount)
  const firstIndex = rows.indexOf(first)
  const before = rows.slice(0, firstIndex + 1).reduce((s, r) => s + signed(r), 0)
  const openingBalance = first.balance! - before

  const mismatches: BalanceCheck['mismatches'] = []
  let running = openingBalance
  for (const r of rows) {
    running += signed(r)
    if (r.balance !== null && r.balance !== running) {
      mismatches.push({ line: r.line, expected: running, actual: r.balance })
      running = r.balance // resync so one bad row doesn't flag every row after it
    }
  }
  return { openingBalance, mismatches }
}

/** Key used to recognise the same entry across imports. */
export function duplicateKey(e: { occurred_at: string; type: EntryType; amount: number; remark: string }): string {
  return [new Date(e.occurred_at).toISOString(), e.type, e.amount, e.remark.trim()].join('|')
}

/**
 * Splits rows into new ones and ones already in the ledger. Uses counts, not a
 * set, so two genuinely identical entries (e.g. two "Tea ₹20" at the same
 * minute) both import when the ledger has none, and re-importing the same file
 * adds nothing.
 */
export function splitDuplicates<T extends ParsedRow>(
  rows: T[],
  existing: { occurred_at: string; type: EntryType; amount: number; remark: string }[],
): { fresh: T[]; duplicates: T[] } {
  const available = new Map<string, number>()
  for (const e of existing) {
    const k = duplicateKey(e)
    available.set(k, (available.get(k) ?? 0) + 1)
  }
  const fresh: T[] = []
  const duplicates: T[] = []
  for (const r of rows) {
    const k = duplicateKey(r)
    const n = available.get(k) ?? 0
    if (n > 0) {
      available.set(k, n - 1)
      duplicates.push(r)
    } else {
      fresh.push(r)
    }
  }
  return { fresh, duplicates }
}

/** CashBook writes "30000" and "1975.39": no grouping, decimals only when needed. */
function csvAmount(paise: number): string {
  const s = formatAmount(Math.abs(paise)).replace(/,/g, '').replace(/\.00$/, '')
  return paise < 0 ? `-${s}` : s
}

export type ExportRow = {
  occurred_at: string
  type: EntryType
  amount: number
  remark: string
  category: string
  balance: number
}

/** Rows must already be in chronological order. */
export function toCashbookCsv(rows: ExportRow[]): string {
  return Papa.unparse(
    {
      fields: ['Date', 'Time', 'Remark', 'Category', 'Cash In', 'Cash Out', 'Balance'],
      data: rows.map((r) => [
        formatDate(r.occurred_at),
        formatTime(r.occurred_at),
        r.remark,
        r.category,
        r.type === 'in' ? csvAmount(r.amount) : '',
        r.type === 'out' ? csvAmount(r.amount) : '',
        csvAmount(r.balance),
      ]),
    },
    { quotes: true, newline: '\n' },
  )
}
