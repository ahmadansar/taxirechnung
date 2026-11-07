// deno run --allow-write tests/xr_samples.ts <outdir>  – writes sample XRechnungen for validation
import { calcTotals } from '../src/lib/money.ts'
import { buildXRechnung, xrechnungMissing } from '../src/lib/xrechnung.ts'
import type { Company, Invoice, InvoiceItem } from '../src/lib/types.ts'

const out = Deno.args[0] ?? '/tmp/xr'
Deno.mkdirSync(out, { recursive: true })
const seller = (small = false): Company => ({
  id: 'c', name: 'Taxi Muster GmbH', owner_name: 'Max Mustermann', street: 'Bahnhofstraße 12', zip: '73728', city: 'Esslingen am Neckar',
  phone: '0711 123456', email: 'info@taxi-muster.de', website: '', tax_number: '59/123/45678', vat_id: small ? '' : 'DE123456789',
  concession_number: 'ES-T-042', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', bank_name: 'Commerzbank', fints_product_id: '',
  small_business: small, invoice_prefix: 'RE', payment_terms_days: 14, default_city: 'Esslingen', logo_data_url: '', footer_note: '', created_at: '',
})
const mk = (name: string, items: InvoiceItem[], extra: Partial<Invoice> = {}, small = false): [string, Invoice] => {
  const s = seller(small)
  return [name, {
    id: name, company_id: 'c', customer_id: 'k', number: 'RE-2026-00' + (10 + name.length), kind: 'invoice', storno_of: null, storno_of_number: null,
    status: 'issued', issue_date: '2026-10-31', due_date: '2026-11-14',
    customer: { company_name: 'Hotel Am Markt GmbH', name: 'Frau Schmidt', street: 'Marktplatz 3', zip: '73728', city: 'Esslingen', email: 'buchhaltung@hotel.example', vat_id: 'DE987654321' },
    seller: s, trip: { date: '2026-10-30', time: '08:15', from: 'Hotel Am Markt', to: 'Flughafen Stuttgart', km: 18.4, within_municipality: false, vehicle_plate: 'ES-TX 1', driver: '', passengers: 2 },
    items, totals: calcTotals(items, small), payment_method: 'on_account', paid: false, paid_at: null, reference: 'KST-77', notes: '', created_at: '', ...extra,
  }]
}
const it = (description: string, quantity: number, eur: number, vat_rate: 0 | 7 | 19): InvoiceItem => ({ description, quantity, unit_price_gross: Math.round(eur * 100), vat_rate })
const cases: [string, Invoice][] = [
  mk('open_7pct', [it('Taxifahrt', 1, 48.5, 7), it('Wartezeit', 3, 4.1, 7)]),
  mk('card_19pct', [it('Taxifahrt Flughafen Frankfurt', 1, 389, 19), it('Gepäckzuschlag', 2, 1.5, 19)], { payment_method: 'card', paid: true, paid_at: '2026-10-30' }),
  mk('mixed_rates', [it('Taxifahrt', 1, 23.45, 7), it('Kurierfahrt', 1, 60.07, 19)], { payment_method: 'transfer' }),
  mk('cash_paid', [it('Taxifahrt', 1, 251.33, 19)], { payment_method: 'cash', paid: true }),
  mk('small_business', [it('Taxifahrt', 1, 47.0, 7)], {}, true),
  mk('storno', [it('Taxifahrt', -1, 48.5, 7), it('Wartezeit', -3, 4.1, 7)], { kind: 'storno', storno_of: 'x', storno_of_number: 'RE-2026-0010', notes: 'Stornierung der Rechnung Nr. RE-2026-0010' }),
  mk('special_chars', [it('Fahrt <Nacht> & "Zuschlag"', 1.5, 13.33, 7)], { reference: '', customer: { company_name: 'Müller & Söhne KG', name: '', street: 'Äußere Str. 1', zip: '70173', city: 'Stuttgart', email: 'r@m.example', vat_id: '' } }),
]
for (const [name, inv] of cases) {
  const miss = xrechnungMissing(inv)
  if (miss.length) throw new Error(name + ' missing ' + miss)
  Deno.writeTextFileSync(`${out}/${name}.xml`, buildXRechnung(inv))
}
// missing-data check
const [, bad] = mk('bad', [it('x', 1, 10, 7)], { customer: { company_name: 'X GmbH', name: '', street: '', zip: '', city: '', email: '', vat_id: '' } })
console.log('missing detection:', xrechnungMissing(bad).join(' | '))
console.log('written', cases.length)
