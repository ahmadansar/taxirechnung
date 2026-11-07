import type { BankConnection, BankSyncResult, Company, Customer, Invoice, InvoiceDraft, Member, PayInfo, User } from '../types'

export interface SignUpResult {
  user: User | null
  /** true when Supabase needs the user to confirm the e-mail first */
  needsConfirmation: boolean
}

export interface Store {
  mode: 'demo' | 'cloud'
  getUser(): Promise<User | null>
  signUp(email: string, password: string): Promise<SignUpResult>
  signIn(email: string, password: string): Promise<User>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>

  getCompany(): Promise<Company | null>
  saveCompany(c: Omit<Company, 'id' | 'created_at'> & { id?: string }): Promise<Company>

  listCustomers(): Promise<Customer[]>
  getCustomer(id: string): Promise<Customer | null>
  saveCustomer(
    c: Omit<Customer, 'id' | 'company_id' | 'customer_number' | 'created_at'> & { id?: string },
  ): Promise<Customer>
  deleteCustomer(id: string): Promise<void>

  listInvoices(): Promise<Invoice[]>
  getInvoice(id: string): Promise<Invoice | null>
  /** Assigns the next sequential number and freezes the seller data (GoBD). */
  createInvoice(draft: InvoiceDraft): Promise<Invoice>
  /** via: 'bank' (bank statement) or 'manual'; paidAt defaults to today */
  setPaid(id: string, paid: boolean, opts?: { via?: string; paidAt?: string }): Promise<Invoice>
  /** Issues a Stornorechnung (negative copy) and marks the original as cancelled. */
  cancelInvoice(id: string): Promise<Invoice>

  exportAll?(): Promise<unknown>

  // ── Team: drivers join with an invite code (cloud only) ──
  listMembers?(): Promise<Member[]>
  createInvite?(): Promise<string>
  removeMember?(userId: string): Promise<void>
  acceptInvite?(code: string): Promise<void>

  /** payment reminder was sent → count + date (allowed after issue, GoBD) */
  markReminded(id: string): Promise<Invoice>

  // ── GoBD archive: the exact files that were issued (cloud only) ──
  archiveInvoice?(inv: Invoice, files: { pdf: Blob; xml?: string }): Promise<string>
  getArchivedFile?(inv: Invoice, kind: 'pdf' | 'xml'): Promise<Blob | null>
  /** remember the date of the last full backup */
  markBackup(): Promise<void>

  /** public (no login): summary + bank details for the customer's pay page */
  payInfo(token: string): Promise<PayInfo>

  // ── Automatic payment check (FinTS, Edge Function "bank-sync") ──
  getBankConnection(): Promise<BankConnection | null>
  /** waits (up to ~2 min) for the approval in the banking app */
  connectBank(p: { iban: string; login: string; pin: string; url?: string }): Promise<{ matched: number; bankName: string; tanMethod: string }>
  /** "Jetzt prüfen" – may ask for an approval in the banking app */
  runBankSync(): Promise<BankSyncResult>
  disconnectBank(): Promise<void>
  /** calls back when invoices change elsewhere (server sync, other device); returns unsubscribe */
  onInvoicesChanged(cb: () => void): () => void
}
