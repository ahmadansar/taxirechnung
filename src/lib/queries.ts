// Server data lives in the TanStack Query cache (one source of truth for all screens).
//   - UI state (search text, filter) stays in the component or in the URL
//   - server data (invoices, customers, bank status) comes from these hooks
//   - changes from elsewhere (bank sync on the server, another phone) invalidate the cache
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { store } from './store'
import type { Invoice } from './types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
})

export const keys = {
  invoices: ['invoices'] as const,
  invoice: (id: string) => ['invoices', id] as const,
  customers: ['customers'] as const,
  customer: (id: string) => ['customers', id] as const,
  bank: ['bank'] as const,
  members: ['members'] as const,
}

export const useInvoices = () => useQuery({ queryKey: keys.invoices, queryFn: () => store.listInvoices() })

export function useInvoice(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: keys.invoice(id ?? ''),
    queryFn: () => store.getInvoice(id!),
    enabled: !!id,
    // show the row from the list instantly while the detail loads
    placeholderData: () => qc.getQueryData<Invoice[]>(keys.invoices)?.find((i) => i.id === id),
  })
}

export const useCustomers = () => useQuery({ queryKey: keys.customers, queryFn: () => store.listCustomers() })

export const useCustomer = (id: string | undefined) =>
  useQuery({ queryKey: keys.customer(id ?? ''), queryFn: () => store.getCustomer(id!), enabled: !!id })

export const useBankConnection = (enabled = true) =>
  useQuery({ queryKey: keys.bank, queryFn: () => store.getBankConnection().catch(() => null), enabled })

/** Put an updated invoice into every cached list/detail without refetching. */
export function putInvoice(qc: QueryClient, inv: Invoice) {
  qc.setQueryData<Invoice[]>(keys.invoices, (l) => (l ? (l.some((x) => x.id === inv.id) ? l.map((x) => (x.id === inv.id ? inv : x)) : [inv, ...l]) : l))
  qc.setQueryData(keys.invoice(inv.id), inv)
}

/** Paid ↔ open with an optimistic update: the button turns green at once, rolls back on error. */
export function useSetPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) => store.setPaid(id, paid),
    onMutate: async ({ id, paid }) => {
      await qc.cancelQueries({ queryKey: keys.invoices })
      const list = qc.getQueryData<Invoice[]>(keys.invoices)
      const one = qc.getQueryData<Invoice>(keys.invoice(id)) ?? list?.find((i) => i.id === id)
      if (one) putInvoice(qc, { ...one, paid, paid_at: paid ? new Date().toISOString().slice(0, 10) : null, paid_via: paid ? 'manual' : null })
      return { list, one }
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.list) qc.setQueryData(keys.invoices, ctx.list)
      if (ctx?.one) qc.setQueryData(keys.invoice(id), ctx.one)
    },
    onSuccess: (inv) => putInvoice(qc, inv),
  })
}

export function useMarkReminded() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => store.markReminded(id), onSuccess: (inv) => putInvoice(qc, inv) })
}

/** Mount once: refresh invoices when they change on the server (bank sync, other device). */
export function useLiveSync(enabled: boolean) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!enabled) return
    return store.onInvoicesChanged(() => {
      qc.invalidateQueries({ queryKey: keys.invoices })
      qc.invalidateQueries({ queryKey: keys.bank })
    })
  }, [enabled, qc])
}
