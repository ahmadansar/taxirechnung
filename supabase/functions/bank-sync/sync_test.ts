// deno test supabase/functions/bank-sync/sync_test.ts
import { deepStrictEqual as eq, ok, rejects } from 'node:assert/strict'
import type { MatchableInvoice } from '../_shared/bank.ts'
import { decrypt, encrypt, importKey } from './crypto.ts'
import { connect, type Deps, type FintsLike, type RespLike, runSync, type StatementRespLike, type StoredConnection, type SyncDb, toBankTx } from './sync.ts'

const IBAN = 'DE89611901100123456789'
const inv = (number: string, gross: number): MatchableInvoice => ({
  id: number, number, kind: 'invoice', status: 'issued', paid: false, issue_date: '2026-10-20', payment_method: 'on_account',
  totals: { gross }, customer: { company_name: 'Hotel Am Markt GmbH', name: '' },
})

/** Fake bank: decoupled SecureGo plus, statements need approval when `scaDue` is true. */
function fakeBank(opts: { scaDue?: boolean; approveAfterPolls?: number; wrongPin?: boolean }) {
  const log: string[] = []
  let polls = 0
  const ok = (extra: Partial<RespLike> = {}): RespLike => ({ success: true, requiresTan: false, bankAnswers: [{ code: 20, text: 'OK' }], ...extra })
  const tanResp = (): RespLike => ({ success: true, requiresTan: true, tanReference: 'ref1', tanChallenge: 'Bitte Auftrag in Ihrer SecureGo plus App freigeben', bankAnswers: [{ code: 3955, text: 'Sicherheitsfreigabe erfolgt über anderen Kanal' }] })
  const txs = [
    { entryDate: new Date('2026-10-30T10:00:00Z'), valueDate: new Date('2026-10-30T10:00:00Z'), amount: 401, purpose: 'Rechnung RE-2026-0002', remoteName: 'Hotel Am Markt GmbH' },
    { entryDate: new Date('2026-10-30T10:00:00Z'), valueDate: new Date('2026-10-30T10:00:00Z'), amount: -65.2, purpose: 'ARAL Tankstelle', remoteName: 'ARAL' },
  ]
  const statements = (): StatementRespLike => ({ ...ok(), statements: [{ transactions: txs }] })
  const client: FintsLike = {
    config: {
      bankingInformation: { bpd: { bankName: 'Volksbank Esslingen' }, upd: { bankAccounts: [{ iban: IBAN }] } },
      availableTanMethods: [
        { id: 972, name: 'Sm@rt-TAN plus', isDecoupled: false, activeTanMedia: [], tanMediaRequirement: 1 },
        { id: 946, name: 'SecureGo plus (Direktfreigabe)', isDecoupled: true, activeTanMedia: ['iPhone'], tanMediaRequirement: 2 },
      ],
    },
    selectTanMethod: (id) => log.push('tan:' + id),
    selectTanMedia: (n) => void log.push('media:' + n),
    synchronize: async () => {
      log.push('sync')
      return opts.wrongPin ? { success: false, requiresTan: false, bankAnswers: [{ code: 9931, text: 'PIN falsch' }] } : ok()
    },
    synchronizeWithTan: async () => ok(),
    getAccountStatements: async (acc, from, to) => {
      log.push(`stmt:${acc.iban}:${from?.toISOString().slice(0, 10)}:${to?.toISOString().slice(0, 10)}`)
      return opts.scaDue ? { ...tanResp(), statements: [] } : statements()
    },
    getAccountStatementsWithTan: async () => {
      polls++
      log.push('poll')
      if (polls < (opts.approveAfterPolls ?? 1)) return { ...tanResp(), bankAnswers: [{ code: 3956, text: 'Freigabe noch ausstehend' }], statements: [] }
      return statements()
    },
  }
  return { client, log }
}

function fakeDb(invoices: MatchableInvoice[]) {
  const paid: Record<string, string> = {}
  const saved: unknown[] = []
  const statuses: unknown[] = []
  const db: SyncDb = {
    openInvoices: async () => invoices.filter((i) => !paid[i.id]),
    markPaid: async (id, at) => {
      if (paid[id]) return false
      paid[id] = at
      return true
    },
    saveConnection: async (c) => void saved.push(c),
    updateStatus: async (_c, p) => void statuses.push(p),
  }
  return { db, paid, saved, statuses }
}

const deps = (client: FintsLike, db: SyncDb, extra: Partial<Deps> = {}): Deps => ({
  makeClient: () => client,
  db,
  sleep: async () => {},
  now: () => new Date('2026-10-31T12:00:00Z'),
  ...extra,
})

const conn = (status: StoredConnection['status'] = 'ok'): StoredConnection => ({
  company_id: 'c1', bank_code: '61190110', bank_name: 'Volksbank', fints_url: 'https://fints1.atruvia.de/cgi-bin/hbciservlet', iban: IBAN,
  login: 'netkey', pin: 'pin', tan_method_id: 946, tan_method_name: 'SecureGo plus', tan_media: 'iPhone', banking_info: {}, status,
})

Deno.test('connect: picks SecureGo plus, waits for approval, marks paid, stores connection', async () => {
  const bank = fakeBank({ scaDue: true, approveAfterPolls: 3 })
  const d = fakeDb([inv('RE-2026-0002', 40100), inv('RE-2026-0003', 6520)])
  const r = await connect({ companyId: 'c1', url: 'u', bankCode: '61190110', login: 'netkey', pin: 'pin', iban: 'DE89 6119 0110 0123 4567 89' }, deps(bank.client, d.db))
  eq(r.matched, 1)
  eq(r.tanMethod, 'SecureGo plus (Direktfreigabe)')
  ok(bank.log.includes('tan:946') && bank.log.includes('media:iPhone'))
  eq(bank.log.filter((l) => l === 'poll').length, 3)
  ok(bank.log.includes(`stmt:${IBAN}:2026-09-01:2026-10-31`), bank.log.join(','))
  eq(d.paid, { 'RE-2026-0002': '2026-10-30' }) // debit of 65,20 never pays RE-2026-0003
  const s = d.saved[0] as Record<string, unknown>
  eq([s.iban, s.tan_method_id, s.status, s.approved], [IBAN, 946, 'ok', true])
})

Deno.test('connect: wrong PIN → login_failed, nothing stored', async () => {
  const bank = fakeBank({ wrongPin: true })
  const d = fakeDb([])
  await rejects(connect({ companyId: 'c1', url: 'u', bankCode: '61190110', login: 'x', pin: 'bad', iban: IBAN }, deps(bank.client, d.db)), /PIN falsch/)
  eq(d.saved.length, 0)
})

Deno.test('cron: approval due → needs_approval without waiting; nothing paid', async () => {
  const bank = fakeBank({ scaDue: true })
  const d = fakeDb([inv('RE-2026-0002', 40100)])
  const r = await runSync(conn(), false, deps(bank.client, d.db))
  eq(r.status, 'needs_approval')
  eq(bank.log.filter((l) => l === 'poll').length, 0)
  eq(d.statuses, [{ status: 'needs_approval', last_error: '' }])
  // cron skips it from now on (no more pushes to the phone)
  const r2 = await runSync(conn('needs_approval'), false, deps(bank.client, d.db))
  eq(r2.status, 'needs_approval')
  eq(bank.log.filter((l) => l.startsWith('stmt')).length, 1)
})

Deno.test('Jetzt prüfen after approval reminder: waits for approval and marks paid', async () => {
  const bank = fakeBank({ scaDue: true, approveAfterPolls: 2 })
  const d = fakeDb([inv('RE-2026-0002', 40100)])
  const r = await runSync(conn('needs_approval'), true, deps(bank.client, d.db))
  eq(r, { status: 'ok', matched: 1 })
  const st = d.statuses[0] as Record<string, unknown>
  eq([st.status, st.approved, st.synced], ['ok', true, true])
})

Deno.test('cron: normal run without TAN marks paid; second run is idempotent', async () => {
  const bank = fakeBank({})
  const d = fakeDb([inv('RE-2026-0002', 40100)])
  eq((await runSync(conn(), false, deps(bank.client, d.db))).matched, 1)
  eq((await runSync(conn(), false, deps(bank.client, d.db))).matched, 0)
})

Deno.test('approval never comes → timeout error', async () => {
  const bank = fakeBank({ scaDue: true, approveAfterPolls: 1e9 })
  const d = fakeDb([])
  let t = 0
  const realNow = Date.now
  Date.now = () => (t += 20_000) // each poll "takes" 20 s
  try {
    await rejects(runSync(conn(), true, deps(bank.client, d.db, { approvalTimeoutSec: 60 })), /nicht rechtzeitig/)
  } finally {
    Date.now = realNow
  }
})

Deno.test('toBankTx + crypto roundtrip bound to company', async () => {
  eq(toBankTx({ entryDate: new Date('2026-10-30T23:30:00Z'), valueDate: new Date(), amount: 48.5, purpose: 'RE-2026-0001', remoteName: ' Hotel ' }), {
    date: '2026-10-31', amountCents: 4850, name: 'Hotel', text: 'RE-2026-0001',
  })
  const key = await importKey(btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i))))
  const c = await encrypt(key, 'geheim-PIN', 'company-a')
  ok(!c.includes('geheim'))
  eq(await decrypt(key, c, 'company-a'), 'geheim-PIN')
  await rejects(decrypt(key, c, 'company-b'))
})
