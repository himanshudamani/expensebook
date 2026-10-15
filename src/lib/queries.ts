import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import * as api from './api'
import type { Entry, EntryWithBalance } from './types'

export const keys = {
  ledgers: ['ledgers'] as const,
  ledger: (id: string) => ['ledger', id] as const,
  entries: (id: string) => ['entries', id] as const,
  categories: (id: string) => ['categories', id] as const,
  members: (id: string) => ['members', id] as const,
  me: ['me'] as const,
}

export const useLedgers = () => useQuery({ queryKey: keys.ledgers, queryFn: api.listLedgers })
export const useLedger = (id: string) => useQuery({ queryKey: keys.ledger(id), queryFn: () => api.getLedger(id) })
export const useEntries = (id: string) => useQuery({ queryKey: keys.entries(id), queryFn: () => api.listEntries(id) })
export const useCategories = (id: string) =>
  useQuery({ queryKey: keys.categories(id), queryFn: () => api.listCategories(id) })
export const useMembers = (id: string) => useQuery({ queryKey: keys.members(id), queryFn: () => api.listMembers(id) })
export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.getMyProfile })

/** Refetches everything that depends on a ledger's entries after a change. */
export function useInvalidateLedger(id: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.entries(id) }),
      qc.invalidateQueries({ queryKey: keys.ledger(id) }),
      qc.invalidateQueries({ queryKey: keys.categories(id) }),
      qc.invalidateQueries({ queryKey: keys.ledgers }),
    ])
}

/** Adds the running balance (over the whole ledger, oldest first) to each entry. */
export function withBalances(entries: Entry[]): EntryWithBalance[] {
  let balance = 0
  return entries.map((e) => {
    balance += e.type === 'in' ? e.amount : -e.amount
    return { ...e, balance }
  })
}

export function useEntriesWithBalance(id: string) {
  const q = useEntries(id)
  const data = useMemo(() => (q.data ? withBalances(q.data) : undefined), [q.data])
  return { ...q, data }
}
