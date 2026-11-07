import { calcTotals } from '../money'
import type { Company, Invoice, InvoiceDraft } from '../types'

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)

export function randomToken() {
  const b = new Uint8Array(18)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Public link the customer opens to pay (works for any host / sub-folder). */
export function payLinkFor(token: string) {
  const base = window.location.origin + window.location.pathname
  return `${base}?pay=${token}`
}

export const formatInvoiceNumber = (prefix: string, year: string, n: number) =>
  `${prefix ? prefix + '-' : ''}${year}-${String(n).padStart(4, '0')}`

export const formatCustomerNumber = (n: number) => `K-${String(n).padStart(4, '0')}`

/** Builds a complete invoice object (without number) from a draft. */
export function buildInvoice(draft: InvoiceDraft, company: Company): Omit<Invoice, 'number'> {
  return {
    ...draft,
    id: uid(),
    company_id: company.id,
    status: 'issued',
    seller: { ...company },
    totals: calcTotals(draft.items, company.small_business),
    created_at: new Date().toISOString(),
  }
}

export function buildStorno(orig: Invoice, issueDate: string): InvoiceDraft {
  return {
    customer_id: orig.customer_id,
    kind: 'storno',
    storno_of: orig.id,
    storno_of_number: orig.number,
    issue_date: issueDate,
    due_date: null,
    customer: orig.customer,
    trip: orig.trip,
    items: orig.items.map((it) => ({ ...it, quantity: -it.quantity })),
    payment_method: orig.payment_method,
    paid: false,
    paid_at: null,
    reference: orig.reference,
    notes: `Stornierung der Rechnung Nr. ${orig.number} vom ${orig.issue_date.split('-').reverse().join('.')}`,
  }
}
