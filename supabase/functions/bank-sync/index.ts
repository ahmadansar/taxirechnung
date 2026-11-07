// Supabase Edge Function "bank-sync": automatic payment check over FinTS (no third party).
//
//   POST /bank-sync/connect     {iban, bank_code, login, pin, url?}   logged-in company (approve in SecureGo plus)
//   POST /bank-sync/run                                               logged-in company ("Jetzt prüfen")
//   POST /bank-sync/disconnect                                        logged-in company
//   POST /bank-sync/cron        Authorization: Bearer <CRON_SECRET>   scheduled, checks all companies
//
// Secrets (supabase secrets set …):
//   FINTS_PRODUCT_ID   optional fallback; normally each company enters its product id in the app
//   BANK_CRED_KEY      32 random bytes, base64 (openssl rand -base64 32)
//   CRON_SECRET        any long random string, also used in the pg_cron job
// Deploy: supabase functions deploy bank-sync --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { FinTSClient, FinTSConfig } from 'npm:lib-fints@1.5.2'
import type { MatchableInvoice } from '../_shared/bank.ts'
import { decrypt, encrypt, importKey } from './crypto.ts'
import { type ClientParams, connect, type Deps, type FintsLike, runSync, type StoredConnection, SyncError, type SyncDb } from './sync.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PRODUCT_ID = Deno.env.get('FINTS_PRODUCT_ID') ?? ''
const PRODUCT_VERSION = Deno.env.get('FINTS_PRODUCT_VERSION') ?? '1.0'
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const VOLKSBANK_URL = 'https://fints1.atruvia.de/cgi-bin/hbciservlet'

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const keyPromise = importKey(Deno.env.get('BANK_CRED_KEY') ?? '')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const must = <T>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

/** Product id entered by the company in the app, or the server-wide secret as fallback. */
async function productIdFor(companyId: string): Promise<string> {
  const c = must(await sb.from('companies').select('fints_product_id').eq('id', companyId).maybeSingle()) as { fints_product_id: string } | null
  const id = (c?.fints_product_id ?? '').trim() || PRODUCT_ID
  if (!id) throw new SyncError('no_product_id', 'Bitte zuerst die FinTS-Produkt-ID unter „Firma → Bankverbindung“ eintragen und speichern.')
  return id
}

const makeClientFor = (productId: string) => (p: ClientParams): FintsLike => {
  const config = p.bankingInfo
    ? FinTSConfig.fromBankingInformation(productId, PRODUCT_VERSION, p.bankingInfo as never, p.login, p.pin, p.tanMethodId ?? undefined, p.tanMedia || undefined)
    : FinTSConfig.forFirstTimeUse(productId, PRODUCT_VERSION, p.url, p.bankCode, p.login, p.pin)
  return new FinTSClient(config) as unknown as FintsLike
}

const db: SyncDb = {
  async openInvoices(companyId) {
    const rows = must(
      await sb
        .from('invoices')
        .select('id, number, kind, status, paid, issue_date, payment_method, totals, customer')
        .eq('company_id', companyId)
        .eq('paid', false)
        .eq('status', 'issued')
        .eq('kind', 'invoice'),
    ) as MatchableInvoice[]
    return rows
  },
  async markPaid(invoiceId, paidAt) {
    const r = must(
      await sb.from('invoices').update({ paid: true, paid_at: paidAt, paid_via: 'bank' }).eq('id', invoiceId).eq('paid', false).select('id'),
    ) as unknown[]
    return r.length > 0
  },
  async saveConnection(c) {
    const key = await keyPromise
    must(
      await sb.from('bank_connections').upsert({
        company_id: c.company_id,
        bank_code: c.bank_code,
        bank_name: c.bank_name,
        fints_url: c.fints_url,
        iban: c.iban,
        login_enc: await encrypt(key, c.login, c.company_id),
        pin_enc: await encrypt(key, c.pin, c.company_id),
        tan_method_id: c.tan_method_id,
        tan_method_name: c.tan_method_name,
        tan_media: c.tan_media,
        banking_info: c.banking_info,
        status: 'ok',
        last_error: '',
        last_sync_at: new Date().toISOString(),
        last_matched: c.matched,
        approved_at: new Date().toISOString(),
      }),
    )
  },
  async updateStatus(companyId, p) {
    const patch: Record<string, unknown> = { status: p.status }
    if (p.last_error !== undefined) patch.last_error = p.last_error
    if (p.last_matched !== undefined) patch.last_matched = p.last_matched
    if (p.synced) patch.last_sync_at = new Date().toISOString()
    if (p.approved) patch.approved_at = new Date().toISOString()
    if (p.banking_info) patch.banking_info = p.banking_info
    must(await sb.from('bank_connections').update(patch).eq('company_id', companyId))
  },
}

const depsFor = async (companyId: string): Promise<Deps> => ({ makeClient: makeClientFor(await productIdFor(companyId)), db })

async function loadConnection(companyId: string): Promise<StoredConnection | null> {
  const row = must(await sb.from('bank_connections').select('*').eq('company_id', companyId).maybeSingle()) as Record<string, unknown> | null
  if (!row) return null
  const key = await keyPromise
  return {
    company_id: companyId,
    bank_code: row.bank_code as string,
    bank_name: row.bank_name as string,
    fints_url: row.fints_url as string,
    iban: row.iban as string,
    login: await decrypt(key, row.login_enc as string, companyId),
    pin: await decrypt(key, row.pin_enc as string, companyId),
    tan_method_id: row.tan_method_id as number | null,
    tan_method_name: row.tan_method_name as string,
    tan_media: row.tan_media as string,
    banking_info: row.banking_info,
    status: row.status as StoredConnection['status'],
  }
}

async function companyFromRequest(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data } = await sb.auth.getUser(jwt)
  if (!data.user) return null
  // only the owner may connect or check the bank account (drivers never see banking data)
  const m = must(await sb.from('company_members').select('company_id, role').eq('user_id', data.user.id).limit(1).maybeSingle()) as { company_id: string; role: string } | null
  return m?.role === 'owner' ? m.company_id : null
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const action = new URL(req.url).pathname.split('/').filter(Boolean).pop()
  try {
    if (action === 'cron') {
      if (!safeEqual((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''), CRON_SECRET)) return json({ error: 'unauthorized' }, 401)
      const rows = must(await sb.from('bank_connections').select('company_id').eq('status', 'ok')) as { company_id: string }[]
      const results: Record<string, unknown> = {}
      for (const r of rows) {
        try {
          const conn = await loadConnection(r.company_id)
          if (conn) results[r.company_id] = await runSync(conn, false, await depsFor(r.company_id))
        } catch (e) {
          results[r.company_id] = { error: e instanceof Error ? e.message : String(e) }
        }
      }
      return json({ checked: rows.length, results })
    }

    const companyId = await companyFromRequest(req)
    if (!companyId) return json({ error: 'unauthorized' }, 401)
    const body = (await req.json().catch(() => ({}))) as Record<string, string>

    if (action === 'connect') {
      const iban = String(body.iban ?? '').replace(/\s/g, '').toUpperCase()
      const bankCode = String(body.bank_code ?? '') || (iban.startsWith('DE') ? iban.slice(4, 12) : '')
      if (!/^\d{8}$/.test(bankCode)) return json({ error: 'bank_code', message: 'Bankleitzahl fehlt.' }, 400)
      if (!body.login || !body.pin) return json({ error: 'missing_login', message: 'Zugangsdaten fehlen.' }, 400)
      const result = await connect({ companyId, url: body.url || VOLKSBANK_URL, bankCode, login: body.login.trim(), pin: body.pin, iban }, await depsFor(companyId))
      return json({ status: 'ok', ...result })
    }
    if (action === 'run') {
      const conn = await loadConnection(companyId)
      if (!conn) return json({ error: 'not_connected' }, 404)
      return json(await runSync(conn, true, await depsFor(companyId)))
    }
    if (action === 'disconnect') {
      must(await sb.from('bank_connections').delete().eq('company_id', companyId))
      return json({ ok: true })
    }
    return json({ error: 'not_found' }, 404)
  } catch (e) {
    if (e instanceof SyncError) return json({ error: e.code, message: e.message }, 400)
    console.error(e)
    return json({ error: 'server_error', message: 'Interner Fehler' }, 500)
  }
})
