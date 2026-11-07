// Cloud store: Supabase (Postgres + Auth). See supabase/schema.sql.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from '../money'
import type { BankConnection, BankSyncResult, Company, Customer, Invoice, Member, PayInfo, Role } from '../types'
import { buildInvoice, buildStorno } from './common'
import type { Store } from './types'

type Row = Record<string, unknown>

function rowToInvoice(r: Row): Invoice {
  const { gross_cents: _g, ...rest } = r
  void _g
  return rest as unknown as Invoice
}

function strip<T extends Row>(o: T, keys: string[]) {
  const c: Row = { ...o }
  keys.forEach((k) => delete c[k])
  return c
}

export function createSupabaseStore(url: string, anonKey: string): Store {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  })

  let companyCache: Company | null = null
  async function company(): Promise<Company> {
    if (companyCache) return companyCache
    const c = await store.getCompany()
    if (!c) throw new Error('no_company')
    return c
  }
  const err = (e: { message: string } | null) => {
    if (e) throw new Error(e.message)
  }

  /** Calls the `bank-sync` Edge Function as the logged-in user. */
  async function bankFn(action: string, body: unknown = {}) {
    const { data } = await sb.auth.getSession()
    const res = await fetch(`${url}/functions/v1/bank-sync/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`)
    return j
  }

  const store: Store = {
    mode: 'cloud',

    async getUser() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      return u ? { id: u.id, email: u.email ?? '' } : null
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(error.message)
      const u = data.session?.user
      return { user: u ? { id: u.id, email: u.email ?? '' } : null, needsConfirmation: !data.session }
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password })
      if (error) throw new Error('invalid_login')
      companyCache = null
      return { id: data.user.id, email: data.user.email ?? '' }
    },
    async signOut() {
      companyCache = null
      await sb.auth.signOut()
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      err(error)
    },

    async getCompany() {
      const { data, error } = await sb.from('companies').select('*').limit(1).maybeSingle()
      err(error)
      if (!data) return (companyCache = null)
      const { data: s } = await sb.auth.getSession()
      const { data: m } = await sb.from('company_members').select('role').eq('company_id', data.id).eq('user_id', s.session?.user.id ?? '').maybeSingle()
      companyCache = { ...(strip(data, ['owner_id']) as unknown as Company), role: (m?.role as Role) ?? 'owner' }
      return companyCache
    },
    async saveCompany(c) {
      const payload = strip(c as Row, ['id', 'created_at', 'last_backup_at', 'role'])
      const existing = companyCache ?? (await store.getCompany())
      const q = existing
        ? sb.from('companies').update(payload).eq('id', existing.id).select('*').single()
        : sb.from('companies').insert(payload).select('*').single()
      const { data, error } = await q
      err(error)
      companyCache = { ...(strip(data, ['owner_id']) as unknown as Company), role: 'owner' }
      return companyCache
    },

    // ── Team (owner + drivers) ──
    async listMembers() {
      const { data, error } = await sb.from('company_members').select('user_id, email, role, created_at').order('created_at')
      err(error)
      return (data ?? []) as Member[]
    },
    async createInvite() {
      const { data, error } = await sb.rpc('create_invite')
      err(error)
      return data as string
    },
    async removeMember(userId) {
      const { error } = await sb.from('company_members').delete().eq('user_id', userId)
      err(error)
    },
    async acceptInvite(code) {
      const { error } = await sb.rpc('accept_invite', { p_code: code })
      err(error)
      companyCache = null
    },
    async markReminded(id) {
      const inv = await store.getInvoice(id)
      if (!inv) throw new Error('not_found')
      const { data, error } = await sb
        .from('invoices')
        .update({ reminder_count: (inv.reminder_count ?? 0) + 1, last_reminder_at: todayISO() })
        .eq('id', id)
        .select('*')
        .single()
      err(error)
      return rowToInvoice(data)
    },

    async listCustomers() {
      const { data, error } = await sb.from('customers').select('*').order('company_name').order('name')
      err(error)
      return (data ?? []) as Customer[]
    },
    async getCustomer(id) {
      const { data, error } = await sb.from('customers').select('*').eq('id', id).maybeSingle()
      err(error)
      return data as Customer | null
    },
    async saveCustomer(input) {
      const c = await company()
      const payload = strip({ ...input, company_id: c.id } as Row, ['id', 'customer_number', 'created_at'])
      const q = input.id
        ? sb.from('customers').update(payload).eq('id', input.id).select('*').single()
        : sb.from('customers').insert(payload).select('*').single()
      const { data, error } = await q
      err(error)
      return data as Customer
    },
    async deleteCustomer(id) {
      const { error } = await sb.from('customers').delete().eq('id', id)
      err(error)
    },

    async listInvoices() {
      const { data, error } = await sb.from('invoices').select('*').order('created_at', { ascending: false }).order('number', { ascending: false })
      err(error)
      return (data ?? []).map(rowToInvoice)
    },
    async getInvoice(id) {
      const { data, error } = await sb.from('invoices').select('*').eq('id', id).maybeSingle()
      err(error)
      return data ? rowToInvoice(data) : null
    },
    async createInvoice(draft) {
      const c = await company()
      const inv = buildInvoice(draft, c)
      const { data, error } = await sb.rpc('issue_invoice', { p: inv })
      err(error)
      return rowToInvoice(data as Row)
    },
    async setPaid(id, paid, opts = {}) {
      const { data, error } = await sb
        .from('invoices')
        .update({ paid, paid_at: paid ? (opts.paidAt ?? todayISO()) : null, paid_via: paid ? (opts.via ?? 'manual') : null })
        .eq('id', id)
        .select('*')
        .single()
      err(error)
      return rowToInvoice(data)
    },
    async payInfo(token) {
      const { data, error } = await sb.rpc('public_invoice', { p_token: token })
      err(error)
      if (!data) throw new Error('pay_not_found')
      return data as PayInfo
    },

    async archiveInvoice(inv, files) {
      const base = `${inv.company_id}/${inv.number}`
      const put = async (path: string, body: Blob, type: string) => {
        const { error } = await sb.storage.from('archive').upload(path, body, { contentType: type, upsert: false })
        // already archived (e.g. second device) is fine – files can never be overwritten
        if (error && !/exists|duplicate|409/i.test(error.message)) throw new Error(error.message)
      }
      await put(base + '.pdf', files.pdf, 'application/pdf')
      if (files.xml) await put(base + '.xml', new Blob([files.xml], { type: 'application/xml' }), 'application/xml')
      const now = new Date().toISOString()
      const { error } = await sb.from('invoices').update({ archived_at: now }).eq('id', inv.id).is('archived_at', null)
      err(error)
      return now
    },
    async getArchivedFile(inv, kind) {
      if (!inv.archived_at) return null
      const { data, error } = await sb.storage.from('archive').download(`${inv.company_id}/${inv.number}.${kind}`)
      if (error) return null
      return data
    },
    async markBackup() {
      const c = companyCache ?? (await store.getCompany())
      if (!c) return
      const { error } = await sb.from('companies').update({ last_backup_at: new Date().toISOString() }).eq('id', c.id)
      err(error)
      companyCache = { ...c, last_backup_at: new Date().toISOString() }
    },

    async getBankConnection() {
      const { data, error } = await sb
        .from('bank_connections')
        .select('bank_code, bank_name, iban, tan_method_name, status, last_error, last_sync_at, last_matched, approved_at')
        .maybeSingle()
      err(error)
      return (data as BankConnection | null) ?? null
    },
    async connectBank(p) {
      return await bankFn('connect', { iban: p.iban, login: p.login, pin: p.pin, url: p.url || undefined })
    },
    async runBankSync() {
      return (await bankFn('run')) as BankSyncResult
    },
    async disconnectBank() {
      await bankFn('disconnect')
    },
    onInvoicesChanged(cb) {
      const ch = sb
        .channel('invoices-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => cb())
        .subscribe()
      return () => {
        sb.removeChannel(ch)
      }
    },

    async cancelInvoice(id) {
      const orig = await store.getInvoice(id)
      if (!orig) throw new Error('not_found')
      return store.createInvoice(buildStorno(orig, todayISO()))
    },
  }
  return store
}
