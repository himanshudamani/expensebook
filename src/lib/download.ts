import { toCashbookCsv } from './cashbookCsv'
import { todayKey } from './dates'
import type { Category, EntryWithBalance } from './types'

export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  // BOM so Excel opens UTF-8 (₹, ’, Hindi text) correctly.
  const blob = new Blob(['﻿', content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Entries must be oldest first; balances are the ledger's running balance. */
export function exportLedgerCsv(ledgerName: string, entries: EntryWithBalance[], categories: Category[]) {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const csv = toCashbookCsv(
    entries.map((e) => ({
      occurred_at: e.occurred_at,
      type: e.type,
      amount: e.amount,
      remark: e.remark,
      category: e.category_id ? (names.get(e.category_id) ?? '') : '',
      balance: e.balance,
    })),
  )
  const safeName = ledgerName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'ledger'
  downloadFile(`${safeName} ${todayKey()}.csv`, csv)
}
