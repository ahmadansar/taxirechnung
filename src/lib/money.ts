import type { InvoiceItem, Totals, VatLine, VatRate } from './types'

/** All amounts are integer cents. Taxi fares are gross prices (Taxameter), so we
 *  sum gross per VAT rate and derive net + VAT per rate group (avoids rounding drift). */
export function calcTotals(items: InvoiceItem[], smallBusiness: boolean): Totals {
  const groups = new Map<VatRate, number>()
  for (const it of items) {
    const rate: VatRate = smallBusiness ? 0 : it.vat_rate
    const lineGross = Math.round(it.quantity * it.unit_price_gross)
    groups.set(rate, (groups.get(rate) ?? 0) + lineGross)
  }
  const lines: VatLine[] = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, gross]) => {
      const net = rate === 0 ? gross : Math.round((gross * 100) / (100 + rate))
      return { rate, gross, net, vat: gross - net }
    })
  return {
    lines,
    gross: lines.reduce((s, l) => s + l.gross, 0),
    net: lines.reduce((s, l) => s + l.net, 0),
    vat: lines.reduce((s, l) => s + l.vat, 0),
  }
}

/** Price typed without VAT → gross price that is stored (VAT added on top). */
export const netToGross = (netCents: number, rate: VatRate) => Math.round((netCents * (100 + rate)) / 100)
export const grossToNet = (grossCents: number, rate: VatRate) => Math.round((grossCents * 100) / (100 + rate))

export const lineTotal = (it: InvoiceItem) => Math.round(it.quantity * it.unit_price_gross)

/** § 33 UStDV: invoices up to and including 250 € gross */
export const SMALL_INVOICE_LIMIT = 25000
export const isSmallInvoice = (grossCents: number) => Math.abs(grossCents) <= SMALL_INVOICE_LIMIT

/** § 12 Abs. 2 Nr. 10 UStG: taxi rides within one municipality or up to 50 km → 7 % */
export function suggestTaxiRate(km: number | null, withinMunicipality: boolean): VatRate {
  if (withinMunicipality) return 7
  if (km == null || Number.isNaN(km)) return 7
  return km <= 50 ? 7 : 19
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
export const fmtEUR = (cents: number) => eur.format(cents / 100)

/** "12,50" | "12.50" | "1.234,50" → 1250 */
export function parseEUR(input: string): number {
  let s = input.replace(/[€\s]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}
export const todayISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}
export function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
