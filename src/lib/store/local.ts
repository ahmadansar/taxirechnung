// Demo store: everything lives in this browser's localStorage. No server needed.
import { todayISO } from '../money'
import type { BankConnection, Company, Customer, Invoice, PayInfo, User } from '../types'
import { buildInvoice, buildStorno, formatCustomerNumber, formatInvoiceNumber, randomToken, uid } from './common'
import type { Store } from './types'

interface DemoUser extends User {
  pw: string
}
interface DB {
  users: DemoUser[]
  session: string | null
  companies: Record<string, Company> // by user id
  customers: Customer[]
  invoices: Invoice[]
  counters: Record<string, number> // `${companyId}:${key}`
  bank?: Record<string, BankConnection> // demo: simulated bank connection per company
}

const KEY = 'taxirechnung:demo:v1'
let mem: DB | null = null
// another tab (e.g. the customer pay page) changed the data → re-read
try {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) mem = null
  })
} catch {
  /* no window */
}

function load(): DB {
  if (mem) return mem
  let db: DB | null = null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) db = JSON.parse(raw)
  } catch {
    /* storage unavailable → in-memory only */
  }
  mem = db ?? { users: [], session: null, companies: {}, customers: [], invoices: [], counters: {} }
  return mem
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    /* ignore */
  }
}

async function hash(pw: string) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('taxirechnung:' + pw))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return 'plain:' + pw
  }
}

function currentUser(): DemoUser | null {
  const db = load()
  return db.users.find((u) => u.id === db.session) ?? null
}
function requireCompany(): Company {
  const u = currentUser()
  if (!u) throw new Error('not_logged_in')
  const c = load().companies[u.id]
  if (!c) throw new Error('no_company')
  return c
}
function next(companyId: string, key: string) {
  const db = load()
  const k = `${companyId}:${key}`
  db.counters[k] = (db.counters[k] ?? 0) + 1
  return db.counters[k]
}

export const localStore: Store = {
  mode: 'demo',

  async getUser() {
    const u = currentUser()
    return u ? { id: u.id, email: u.email } : null
  },
  async signUp(email, password) {
    const db = load()
    email = email.trim().toLowerCase()
    if (db.users.some((u) => u.email === email)) throw new Error('email_taken')
    const u: DemoUser = { id: uid(), email, pw: await hash(password) }
    db.users.push(u)
    db.session = u.id
    save()
    return { user: { id: u.id, email }, needsConfirmation: false }
  },
  async signIn(email, password) {
    const db = load()
    const u = db.users.find((x) => x.email === email.trim().toLowerCase())
    if (!u || u.pw !== (await hash(password))) throw new Error('invalid_login')
    db.session = u.id
    save()
    return { id: u.id, email: u.email }
  },
  async signOut() {
    load().session = null
    save()
  },
  async resetPassword() {
    throw new Error('demo_no_reset')
  },

  async getCompany() {
    const u = currentUser()
    const c = u ? load().companies[u.id] : null
    return c ? { ...c, role: c.role ?? 'owner' } : null
  },
  async saveCompany(c) {
    const u = currentUser()
    if (!u) throw new Error('not_logged_in')
    const db = load()
    const prev = db.companies[u.id]
    const company: Company = {
      ...c,
      id: prev?.id ?? uid(),
      created_at: prev?.created_at ?? new Date().toISOString(),
      last_backup_at: prev?.last_backup_at ?? null,
    }
    db.companies[u.id] = company
    save()
    return company
  },

  async listCustomers() {
    const c = requireCompany()
    return load()
      .customers.filter((x) => x.company_id === c.id)
      .sort((a, b) => (a.company_name || a.name).localeCompare(b.company_name || b.name, 'de'))
  },
  async getCustomer(id) {
    const c = requireCompany()
    return load().customers.find((x) => x.id === id && x.company_id === c.id) ?? null
  },
  async saveCustomer(input) {
    const c = requireCompany()
    const db = load()
    const idx = input.id ? db.customers.findIndex((x) => x.id === input.id && x.company_id === c.id) : -1
    if (idx >= 0) {
      db.customers[idx] = { ...db.customers[idx], ...input, id: db.customers[idx].id }
      save()
      return db.customers[idx]
    }
    const cust: Customer = {
      ...input,
      id: uid(),
      company_id: c.id,
      customer_number: formatCustomerNumber(next(c.id, 'customer')),
      created_at: new Date().toISOString(),
    }
    db.customers.push(cust)
    save()
    return cust
  },
  async deleteCustomer(id) {
    const c = requireCompany()
    const db = load()
    db.customers = db.customers.filter((x) => !(x.id === id && x.company_id === c.id))
    // invoices keep their frozen customer snapshot, only the link is removed
    db.invoices.forEach((inv) => {
      if (inv.customer_id === id) inv.customer_id = null
    })
    save()
  },

  async listInvoices() {
    const c = requireCompany()
    return load()
      .invoices.filter((x) => x.company_id === c.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.number.localeCompare(a.number))
  },
  async getInvoice(id) {
    const c = requireCompany()
    return load().invoices.find((x) => x.id === id && x.company_id === c.id) ?? null
  },
  async createInvoice(draft) {
    const c = requireCompany()
    const year = draft.issue_date.slice(0, 4)
    const base = buildInvoice(draft, c)
    const inv: Invoice = {
      ...base,
      number: formatInvoiceNumber(c.invoice_prefix, year, next(c.id, 'invoice:' + year)),
      payment_token: randomToken(),
      paid_via: null,
    }
    load().invoices.push(inv)
    save()
    return inv
  },
  async setPaid(id, paid, opts = {}) {
    const inv = await this.getInvoice(id)
    if (!inv) throw new Error('not_found')
    inv.paid = paid
    inv.paid_at = paid ? (opts.paidAt ?? todayISO()) : null
    inv.paid_via = paid ? (opts.via ?? 'manual') : null
    save()
    return inv
  },
  async markReminded(id) {
    const inv = await this.getInvoice(id)
    if (!inv) throw new Error('not_found')
    inv.reminder_count = (inv.reminder_count ?? 0) + 1
    inv.last_reminder_at = todayISO()
    save()
    return inv
  },
  async cancelInvoice(id) {
    const inv = await this.getInvoice(id)
    if (!inv) throw new Error('not_found')
    if (inv.status === 'cancelled' || inv.kind === 'storno') throw new Error('cannot_cancel')
    const storno = await this.createInvoice(buildStorno(inv, todayISO()))
    inv.status = 'cancelled'
    save()
    return storno
  },
  async payInfo(token) {
    const inv = load().invoices.find((i) => i.payment_token === token)
    if (!inv) throw new Error('pay_not_found')
    const info: PayInfo = {
      number: inv.number,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      amount_cents: inv.totals.gross,
      company: inv.seller.name,
      company_city: inv.seller.city,
      account_holder: (inv.seller.account_holder ?? '').trim() || inv.seller.name,
      iban: inv.seller.iban,
      bic: inv.seller.bic,
      bank_name: inv.seller.bank_name,
      customer: inv.customer ? inv.customer.company_name || inv.customer.name : '',
      paid: inv.paid,
      paid_at: inv.paid_at,
      cancelled: inv.status === 'cancelled' || inv.kind === 'storno',
    }
    return info
  },

  async markBackup() {
    const u = currentUser()
    if (!u) return
    const db = load()
    const c = db.companies[u.id]
    if (c) {
      c.last_backup_at = new Date().toISOString()
      save()
    }
  },

  // ── Automatic payment check (simulated in the demo) ──
  async getBankConnection() {
    const c = requireCompany()
    return load().bank?.[c.id] ?? null
  },
  async connectBank(p) {
    const c = requireCompany()
    if (!p.login.trim() || !p.pin) throw new Error('missing_login')
    await new Promise((r) => setTimeout(r, 1500)) // "approve in the app"
    const db = load()
    db.bank = db.bank ?? {}
    db.bank[c.id] = {
      bank_code: p.iban.replace(/\s/g, '').slice(4, 12),
      bank_name: 'Volksbank (Demo)',
      iban: p.iban.replace(/\s/g, '').toUpperCase(),
      tan_method_name: 'SecureGo plus',
      status: 'ok',
      last_error: '',
      last_sync_at: new Date().toISOString(),
      last_matched: 0,
      approved_at: new Date().toISOString(),
    }
    save()
    const r = await this.runBankSync()
    return { matched: r.matched, bankName: 'Volksbank (Demo)', tanMethod: 'SecureGo plus' }
  },
  async runBankSync() {
    // Demo: pretend the customers paid every open transfer invoice
    const c = requireCompany()
    const db = load()
    const conn = db.bank?.[c.id]
    if (!conn) throw new Error('not_connected')
    let matched = 0
    for (const inv of db.invoices) {
      if (inv.company_id === c.id && inv.kind === 'invoice' && inv.status === 'issued' && !inv.paid && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account')) {
        inv.paid = true
        inv.paid_at = todayISO()
        inv.paid_via = 'bank'
        matched++
      }
    }
    Object.assign(conn, { status: 'ok', last_sync_at: new Date().toISOString(), last_matched: matched, last_error: '' })
    save()
    return { status: 'ok' as const, matched }
  },
  async disconnectBank() {
    const c = requireCompany()
    const db = load()
    if (db.bank) delete db.bank[c.id]
    save()
  },
  onInvoicesChanged(cb) {
    const h = (e: StorageEvent) => e.key === KEY && cb()
    try {
      window.addEventListener('storage', h)
    } catch {
      /* no window */
    }
    return () => window.removeEventListener('storage', h)
  },

  async exportAll() {
    const c = requireCompany()
    const db = load()
    return {
      company: c,
      customers: db.customers.filter((x) => x.company_id === c.id),
      invoices: db.invoices.filter((x) => x.company_id === c.id),
    }
  },
}
