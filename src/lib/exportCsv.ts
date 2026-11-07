import type { Invoice } from './types'

const c = (n: number) => (n / 100).toFixed(2).replace('.', ',')
const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
const pm: Record<string, string> = { cash: 'Bar', card: 'Karte', transfer: 'Überweisung', on_account: 'Rechnung' }

/** Semicolon CSV (opens directly in German Excel) for the Steuerberater. */
export function exportInvoicesCsv(list: Invoice[]): Blob {
  const header = [
    'Rechnungsnr', 'Art', 'Status', 'Rechnungsdatum', 'Leistungsdatum', 'Kunde', 'Von', 'Nach', 'km',
    'Netto 7%', 'USt 7%', 'Netto 19%', 'USt 19%', 'Netto 0%', 'Brutto', 'Zahlart', 'Bezahlt', 'Bezahlt am', 'Storno zu',
  ]
  const rows = [...list]
    .sort((a, b) => a.number.localeCompare(b.number))
    .map((i) => {
      const line = (r: number) => i.totals.lines.find((l) => l.rate === r)
      const cust = i.customer ? i.customer.company_name || i.customer.name : 'Barkunde'
      return [
        q(i.number), q(i.kind === 'storno' ? 'Storno' : 'Rechnung'), q(i.status === 'cancelled' ? 'storniert' : 'gültig'),
        q(i.issue_date), q(i.trip.date), q(cust), q(i.trip.from), q(i.trip.to), q(i.trip.km ?? ''),
        c(line(7)?.net ?? 0), c(line(7)?.vat ?? 0), c(line(19)?.net ?? 0), c(line(19)?.vat ?? 0), c(line(0)?.net ?? 0),
        c(i.totals.gross), q(pm[i.payment_method]), q(i.paid ? 'ja' : 'nein'), q(i.paid_at ?? ''), q(i.storno_of_number ?? ''),
      ].join(';')
    })
  return new Blob(['﻿' + [header.join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
}
