// Core of the automatic payment check: talk to the bank over FinTS, read incoming payments,
// match them to open invoices and mark those invoices as paid.
// The FinTS client and the database are injected, so this file is testable without a bank.
import { type BankTx, matchPayments, type MatchableInvoice } from '../_shared/bank.ts'

// ── minimal shapes of lib-fints we rely on ──
export interface TanMethodLike {
  id: number
  name: string
  isDecoupled: boolean
  activeTanMedia: string[]
  tanMediaRequirement: number // 0 not allowed, 1 optional, 2 required
  decoupled?: { waitingSecondsBeforeFirstStatusRequest: number; waitingSecondsBetweenStatusRequests: number; maxStatusRequests: number }
}
export interface BankAnswerLike {
  code: number
  text: string
}
export interface RespLike {
  success: boolean
  requiresTan: boolean
  tanReference?: string
  tanChallenge?: string
  bankAnswers: BankAnswerLike[]
}
export interface TxLike {
  entryDate: Date
  valueDate: Date
  amount: number
  purpose?: string
  bookingText?: string
  remoteName?: string
  e2eReference?: string
  additionalInformation?: string
}
export interface StatementRespLike extends RespLike {
  statements: { transactions: TxLike[] }[]
}
export interface AccountLike {
  iban?: string
  accountNumber?: string
}
export interface FintsLike {
  config: {
    bankingInformation: { bpd?: { bankName?: string }; upd?: { bankAccounts: AccountLike[] } } & Record<string, unknown>
    availableTanMethods: TanMethodLike[]
  }
  selectTanMethod(id: number): unknown
  selectTanMedia(name: string): void
  synchronize(): Promise<RespLike>
  synchronizeWithTan(ref: string, tan?: string): Promise<RespLike>
  getAccountStatements(account: AccountLike, from?: Date, to?: Date): Promise<StatementRespLike>
  getAccountStatementsWithTan(ref: string, tan?: string): Promise<StatementRespLike>
}

export interface ClientParams {
  url: string
  bankCode: string
  login: string
  pin: string
  bankingInfo?: unknown
  tanMethodId?: number | null
  tanMedia?: string
}

export interface StoredConnection {
  company_id: string
  bank_code: string
  bank_name: string
  fints_url: string
  iban: string
  login: string // decrypted
  pin: string // decrypted
  tan_method_id: number | null
  tan_method_name: string
  tan_media: string
  banking_info: unknown
  status: 'ok' | 'needs_approval' | 'error'
}

export interface SyncDb {
  openInvoices(companyId: string): Promise<MatchableInvoice[]>
  markPaid(invoiceId: string, paidAt: string): Promise<boolean>
  saveConnection(c: StoredConnection & { approved: boolean; matched: number }): Promise<void>
  updateStatus(companyId: string, patch: { status: StoredConnection['status']; last_error?: string; last_matched?: number; synced?: boolean; approved?: boolean; banking_info?: unknown }): Promise<void>
}

export interface Deps {
  makeClient(p: ClientParams): FintsLike
  db: SyncDb
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  /** max seconds to wait for the SecureGo plus approval in one request */
  approvalTimeoutSec?: number
}

export class SyncError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

const bankText = (r: RespLike) =>
  r.bankAnswers
    .filter((a) => a.code >= 9000 || (a.code >= 3000 && a.code < 4000))
    .map((a) => `${a.code} ${a.text}`)
    .join(' | ') || 'Unbekannte Antwort der Bank'

const normIban = (s: string) => s.replace(/\s/g, '').toUpperCase()
const berlinDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d)

/** Handles a TAN request. Decoupled (SecureGo plus): poll until the user approved in the app. */
async function approve<R extends RespLike>(r: R, cont: (ref: string) => Promise<R>, wait: boolean, deps: Deps): Promise<{ resp: R; approved: boolean }> {
  if (!r.success) throw new SyncError('bank_error', bankText(r))
  if (!r.requiresTan) return { resp: r, approved: false }
  if (!wait) throw new SyncError('needs_approval', r.tanChallenge || 'Freigabe in der Banking-App erforderlich')
  const sleep = deps.sleep ?? ((ms) => new Promise((res) => setTimeout(res, ms)))
  const deadline = Date.now() + (deps.approvalTimeoutSec ?? 110) * 1000
  await sleep(5000)
  let cur = r
  while (cur.requiresTan) {
    if (Date.now() > deadline) throw new SyncError('approval_timeout', 'Die Freigabe in der Banking-App kam nicht rechtzeitig. Bitte erneut versuchen.')
    cur = await cont(cur.tanReference!)
    if (!cur.success) throw new SyncError('bank_error', bankText(cur))
    if (cur.requiresTan) await sleep(3000)
  }
  return { resp: cur, approved: true }
}

export function toBankTx(t: TxLike): BankTx {
  return {
    date: berlinDate(t.entryDate ?? t.valueDate),
    amountCents: Math.round(t.amount * 100),
    name: (t.remoteName ?? '').trim(),
    text: [t.purpose, t.bookingText, t.e2eReference, t.additionalInformation].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
  }
}

function pickTanMethod(methods: TanMethodLike[]): TanMethodLike {
  const decoupled = methods.filter((m) => m.isDecoupled)
  const best = decoupled.find((m) => /securego/i.test(m.name)) ?? decoupled[0]
  if (!best) {
    throw new SyncError(
      'no_decoupled_tan',
      'Für die automatische Prüfung wird ein App-Freigabeverfahren benötigt (z. B. VR SecureGo plus). Bitte bei der Bank aktivieren.',
    )
  }
  return best
}

function useTanMethod(client: FintsLike, m: TanMethodLike, media?: string) {
  client.selectTanMethod(m.id)
  const name = media || (m.tanMediaRequirement === 2 || m.activeTanMedia.length === 1 ? m.activeTanMedia[0] : '')
  if (name) client.selectTanMedia(name)
  return name ?? ''
}

async function fetchTransactions(client: FintsLike, iban: string, wait: boolean, deps: Deps) {
  const accounts = client.config.bankingInformation.upd?.bankAccounts ?? []
  const account = accounts.find((a) => a.iban && normIban(a.iban) === normIban(iban))
  if (!account) {
    const list = accounts.map((a) => a.iban).filter(Boolean).join(', ')
    throw new SyncError('account_not_found', `Konto ${iban} nicht gefunden.${list ? ' Verfügbar: ' + list : ''}`)
  }
  const now = (deps.now ?? (() => new Date()))()
  const from = new Date(now.getTime() - 60 * 86_400_000)
  const first = await client.getAccountStatements(account, from, now)
  const { resp, approved } = await approve(first, (ref) => client.getAccountStatementsWithTan(ref), wait, deps)
  const txs = resp.statements.flatMap((s) => s.transactions).map(toBankTx)
  return { txs, approved }
}

async function settle(companyId: string, txs: BankTx[], db: SyncDb) {
  const open = await db.openInvoices(companyId)
  const { auto } = matchPayments(txs, open)
  let n = 0
  for (const m of auto) if (await db.markPaid(m.invoice.id, m.tx.date)) n++
  return n
}

/** First connection (user is present and approves in the banking app). */
export async function connect(
  input: { companyId: string; url: string; bankCode: string; login: string; pin: string; iban: string },
  deps: Deps,
) {
  const client = deps.makeClient({ url: input.url, bankCode: input.bankCode, login: input.login, pin: input.pin })
  const first = await client.synchronize()
  if (!first.success) throw new SyncError('login_failed', bankText(first))
  const method = pickTanMethod(client.config.availableTanMethods)
  const media = useTanMethod(client, method)
  const sync2 = await approve(await client.synchronize(), (ref) => client.synchronizeWithTan(ref), true, deps)
  const { txs, approved } = await fetchTransactions(client, input.iban, true, deps)
  const matched = await settle(input.companyId, txs, deps.db)
  await deps.db.saveConnection({
    company_id: input.companyId,
    bank_code: input.bankCode,
    bank_name: client.config.bankingInformation.bpd?.bankName ?? '',
    fints_url: input.url,
    iban: normIban(input.iban),
    login: input.login,
    pin: input.pin,
    tan_method_id: method.id,
    tan_method_name: method.name,
    tan_media: media,
    banking_info: client.config.bankingInformation,
    status: 'ok',
    approved: approved || sync2.approved,
    matched,
  })
  return { matched, incoming: txs.filter((t) => t.amountCents > 0).length, bankName: client.config.bankingInformation.bpd?.bankName ?? '', tanMethod: method.name }
}

/** Regular check. interactive=true: user tapped "Jetzt prüfen" and can approve if the bank asks. */
export async function runSync(conn: StoredConnection, interactive: boolean, deps: Deps) {
  if (conn.status !== 'ok' && !interactive) return { status: conn.status, matched: 0 }
  const client = deps.makeClient({
    url: conn.fints_url,
    bankCode: conn.bank_code,
    login: conn.login,
    pin: conn.pin,
    bankingInfo: conn.banking_info,
    tanMethodId: conn.tan_method_id,
    tanMedia: conn.tan_media,
  })
  try {
    const { txs, approved } = await fetchTransactions(client, conn.iban, interactive, deps)
    const matched = await settle(conn.company_id, txs, deps.db)
    await deps.db.updateStatus(conn.company_id, {
      status: 'ok',
      last_error: '',
      last_matched: matched,
      synced: true,
      approved,
      banking_info: client.config.bankingInformation,
    })
    return { status: 'ok' as StoredConnection['status'], matched }
  } catch (e) {
    if (e instanceof SyncError && e.code === 'needs_approval') {
      await deps.db.updateStatus(conn.company_id, { status: 'needs_approval', last_error: '' })
      return { status: 'needs_approval' as StoredConnection['status'], matched: 0 }
    }
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500)
    // Bank rejected us (e.g. wrong PIN): stop automatic attempts so the bank never locks the
    // login after repeated failures. Network hiccups keep the schedule running.
    const hard = e instanceof SyncError && ['bank_error', 'login_failed', 'account_not_found', 'no_decoupled_tan'].includes(e.code)
    await deps.db.updateStatus(conn.company_id, { status: hard ? 'error' : conn.status, last_error: msg })
    throw e
  }
}
