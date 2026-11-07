import { TERMS_VERSION } from '../legal/operator'
// Example data for the demo ("Mit Beispieldaten ausprobieren"). Clearly fictional.
import { addDays, todayISO } from './money'
import { store } from './store'

export async function seedDemo() {
  const email = `beispiel-${Date.now().toString(36)}@demo.local`
  await store.signUp(email, 'demo-demo-demo')
  await store.saveCompany({
    name: 'Taxi Beispiel GmbH',
    owner_name: 'Erika Beispiel',
    street: 'Musterstraße 1',
    zip: '73728',
    city: 'Esslingen am Neckar',
    phone: '0711 000000',
    email: 'info@taxi-beispiel.de',
    website: '',
    tax_number: '00/000/00000',
    vat_id: '',
    concession_number: 'BEISPIEL-001',
    iban: 'DE00 0000 0000 0000 0000 00',
    bic: '',
    bank_name: 'Beispielbank',
    fints_product_id: '',
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
    small_business: false,
    invoice_prefix: 'RE',
    payment_terms_days: 14,
    default_city: 'Esslingen am Neckar',
    logo_data_url: '',
    footer_note: 'Vielen Dank für Ihre Fahrt!',
  })
  const base = { email: '', phone: '', vat_id: '', reference: '', notes: '' }
  const hotel = await store.saveCustomer({
    ...base,
    type: 'business',
    company_name: 'Beispiel-Hotel am Markt (Beispiel)',
    name: 'Rezeption',
    street: 'Marktplatz 1',
    zip: '73728',
    city: 'Esslingen',
    email: 'rezeption@example.com',
    reference: 'KST-100',
  })
  const praxis = await store.saveCustomer({
    ...base,
    type: 'business',
    company_name: 'Beispiel Arztpraxis (Beispiel)',
    name: '',
    street: 'Am Park 5',
    zip: '73730',
    city: 'Esslingen',
  })
  await store.saveCustomer({ ...base, type: 'private', company_name: '', name: 'Max Beispiel', street: 'Lindenweg 3', zip: '73728', city: 'Esslingen', phone: '0151 0000000' })

  const today = todayISO()
  const trip = (from: string, to: string, km: number, date = today) => ({
    date, time: '08:15', from, to, km, within_municipality: false, vehicle_plate: 'ES-XX 1', driver: '', passengers: 1,
  })
  const common = { kind: 'invoice' as const, storno_of: null, storno_of_number: null, notes: '' }
  await store.createInvoice({
    ...common,
    customer_id: hotel.id,
    issue_date: today,
    due_date: addDays(today, 14),
    customer: { company_name: hotel.company_name, name: hotel.name, street: hotel.street, zip: hotel.zip, city: hotel.city, email: hotel.email, vat_id: '' },
    trip: trip('Hotel am Markt, Esslingen', 'Flughafen Stuttgart', 18),
    items: [{ description: 'Taxifahrt', quantity: 1, unit_price_gross: 4850, vat_rate: 7 }],
    payment_method: 'on_account',
    paid: false,
    paid_at: null,
    reference: 'KST-100',
  })
  await store.createInvoice({
    ...common,
    customer_id: praxis.id,
    issue_date: today,
    due_date: addDays(today, 14),
    customer: { company_name: praxis.company_name, name: '', street: praxis.street, zip: praxis.zip, city: praxis.city, email: '', vat_id: '' },
    trip: trip('Am Park 5, Esslingen', 'Klinikum Stuttgart', 16),
    items: [
      { description: 'Taxifahrt', quantity: 1, unit_price_gross: 4200, vat_rate: 7 },
      { description: 'Wartezeit', quantity: 1, unit_price_gross: 900, vat_rate: 7 },
    ],
    payment_method: 'transfer',
    paid: true,
    paid_at: today,
    reference: '',
  })
  await store.createInvoice({
    ...common,
    customer_id: null,
    issue_date: today,
    due_date: null,
    customer: null,
    trip: trip('Bahnhof Esslingen', 'Esslingen-Berkheim', 6),
    items: [{ description: 'Taxifahrt', quantity: 1, unit_price_gross: 1990, vat_rate: 7 }],
    payment_method: 'cash',
    paid: true,
    paid_at: today,
    reference: '',
  })
  // overdue example → shows the reminder proposal on the start screen
  const old = addDays(today, -30)
  await store.createInvoice({
    ...common,
    customer_id: hotel.id,
    issue_date: old,
    due_date: addDays(old, 14),
    customer: { company_name: hotel.company_name, name: hotel.name, street: hotel.street, zip: hotel.zip, city: hotel.city, email: hotel.email, vat_id: '' },
    trip: trip('Hotel am Markt, Esslingen', 'Messe Stuttgart', 21, old),
    items: [{ description: 'Taxifahrt', quantity: 1, unit_price_gross: 5600, vat_rate: 7 }],
    payment_method: 'on_account',
    paid: false,
    paid_at: null,
    reference: 'KST-100',
  })
}
