import { todayISO } from './money'
import type { Invoice } from './types'

export const isOpen = (inv: Invoice) =>
  inv.kind === 'invoice' && inv.status === 'issued' && !inv.paid && inv.payment_method !== 'cash' && inv.payment_method !== 'card'

export type State = 'paid' | 'open' | 'overdue' | 'storno' | 'cancelled'

export function paymentState(inv: Invoice): State {
  if (inv.kind === 'storno') return 'storno'
  if (inv.status === 'cancelled') return 'cancelled'
  if (inv.paid || inv.payment_method === 'cash' || inv.payment_method === 'card') return 'paid'
  if (inv.due_date && inv.due_date < todayISO()) return 'overdue'
  return 'open'
}

