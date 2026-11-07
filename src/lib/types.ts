export type VatRate = 0 | 7 | 19

export interface Company {
  id: string
  name: string // Firmenname, e.g. "Taxi Müller"
  owner_name: string // Inhaber
  street: string
  zip: string
  city: string
  phone: string
  email: string
  website: string
  tax_number: string // Steuernummer
  vat_id: string // USt-IdNr.
  concession_number: string // Konzessions-/Ordnungsnummer
  iban: string
  bic: string
  bank_name: string
  /** Kontoinhaber exactly as the bank has it (checked by the payer's bank: Verification of Payee) */
  account_holder?: string
  /** FinTS product id (from fints.org) – enables the automatic payment check */
  fints_product_id: string
  /** last full data export (backup reminder) */
  last_backup_at?: string | null
  /** when the company accepted terms of use + AVV, and which version */
  terms_accepted_at?: string | null
  terms_version?: string
  small_business: boolean // Kleinunternehmer § 19 UStG
  invoice_prefix: string // e.g. "RE"
  payment_terms_days: number
  default_city: string // Betriebssitz-Gemeinde, used for the 7 % hint
  logo_data_url: string
  footer_note: string
  created_at: string
  /** the logged-in user's role in this company (not stored on the company) */
  role?: Role
}

export type Role = 'owner' | 'driver'

export interface Member {
  user_id: string
  email: string
  role: Role
  created_at: string
}

export type CustomerType = 'private' | 'business'

export interface Customer {
  id: string
  company_id: string
  customer_number: string
  type: CustomerType
  company_name: string
  name: string // contact person / private customer name
  street: string
  zip: string
  city: string
  email: string
  phone: string
  vat_id: string
  reference: string // default Kostenstelle / Bestellnummer
  notes: string
  created_at: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  unit_price_gross: number // in cents
  vat_rate: VatRate
}

export interface Trip {
  date: string // YYYY-MM-DD (Leistungsdatum)
  time: string // HH:MM
  from: string
  to: string
  km: number | null
  within_municipality: boolean
  vehicle_plate: string
  driver: string
  passengers: number | null
}

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'on_account'

export interface VatLine {
  rate: VatRate
  net: number
  vat: number
  gross: number
}

export interface Totals {
  net: number
  vat: number
  gross: number
  lines: VatLine[]
}

export interface PartySnapshot {
  company_name: string
  name: string
  street: string
  zip: string
  city: string
  email: string
  vat_id: string
}

export interface Invoice {
  id: string
  company_id: string
  customer_id: string | null
  number: string
  kind: 'invoice' | 'storno'
  storno_of: string | null // id of the original invoice (for kind = storno)
  storno_of_number: string | null
  status: 'issued' | 'cancelled'
  issue_date: string
  due_date: string | null
  customer: PartySnapshot | null // null = Kleinbetragsrechnung without recipient
  seller: Company // frozen copy at time of issue (GoBD)
  trip: Trip
  items: InvoiceItem[]
  totals: Totals
  payment_method: PaymentMethod
  paid: boolean
  paid_at: string | null
  reference: string
  notes: string
  created_at: string
  /** secret token for the customer's online payment link */
  payment_token?: string
  /** 'bank' = matched from a bank statement, 'manual' = ticked by hand */
  paid_via?: string | null
  /** when the issued PDF (and XRechnung) were stored in the unchangeable archive */
  archived_at?: string | null
  /** user who issued the invoice (owner or driver) */
  created_by?: string | null
  /** payment reminders sent so far, and when the last one went out */
  reminder_count?: number
  last_reminder_at?: string | null
}

/** What the customer sees on the public pay page (bank transfer details) */
export interface PayInfo {
  number: string
  issue_date: string
  due_date: string | null
  amount_cents: number
  company: string
  company_city: string
  account_holder: string
  iban: string
  bic: string
  bank_name: string
  customer: string
  paid: boolean
  paid_at: string | null
  cancelled: boolean
}

/** Automatic payment check over FinTS (status only, never the login) */
export interface BankConnection {
  bank_code: string
  bank_name: string
  iban: string
  tan_method_name: string
  status: 'ok' | 'needs_approval' | 'error'
  last_error: string
  last_sync_at: string | null
  last_matched: number
  approved_at: string | null
}

export interface BankSyncResult {
  status: BankConnection['status']
  matched: number
}

/** Everything needed to issue a new invoice; number/ids are assigned by the store. */
export type InvoiceDraft = Omit<
  Invoice,
  'id' | 'company_id' | 'number' | 'status' | 'created_at' | 'seller' | 'totals' | 'payment_token' | 'paid_via' | 'archived_at' | 'created_by' | 'reminder_count' | 'last_reminder_at'
>

export interface User {
  id: string
  email: string
}
