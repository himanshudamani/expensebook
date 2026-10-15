export type EntryType = 'in' | 'out'

export type Profile = {
  id: string
  email: string
  name: string | null
}

export type LedgerSummary = {
  id: string
  name: string
  owner_id: string
  created_at: string
  total_in: number
  total_out: number
  entry_count: number
  last_entry_at: string | null
  member_count: number
}

export type Member = {
  ledger_id: string
  user_id: string
  role: 'owner' | 'editor'
  profile: Profile | null
}

export type Category = {
  id: string
  ledger_id: string
  name: string
}

/** An entry as stored, with the amount converted to integer paise. */
export type Entry = {
  id: string
  ledger_id: string
  type: EntryType
  amount: number
  occurred_at: string
  remark: string
  category_id: string | null
  created_by: string | null
  created_at: string
}

/** An entry with the ledger's running balance after it (paise). */
export type EntryWithBalance = Entry & { balance: number }
