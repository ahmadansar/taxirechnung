import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ApprovalOverlay, fmtTime } from '../components/BankConnection'
import { InvoiceRow, isOpen } from '../components/InvoiceRow'
import { IconPlus, IconUsers } from '../components/icons'
import { Card, Empty, Page, Section, TopBar } from '../components/ui'
import { backupDue, downloadFullBackup } from '../lib/backup'
import { useI18n } from '../lib/i18n'
import { fmtDate, fmtEUR, todayISO } from '../lib/money'
import { keys, useBankConnection, useCustomers, useInvoices } from '../lib/queries'
import { daysOverdue, levelTitle, nextLevel, overdueByUrgency, reminderDue } from '../lib/reminder'
import { useIsOwner, useSession } from '../lib/session'
import { store } from '../lib/store'

export default function Dashboard() {
  const { t, te, lang } = useI18n()
  const { company, setCompany } = useSession()
  const isOwner = useIsOwner()
  const qc = useQueryClient()
  const invoicesQ = useInvoices()
  const invoices = invoicesQ.data ?? null
  const customers = useCustomers().data ?? []
  const bank = useBankConnection(isOwner).data ?? null
  const [backingUp, setBackingUp] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [bankMsg, setBankMsg] = useState('')

  // regular customers = most invoiced
  const regulars = useMemo(() => {
    const count = new Map<string, number>()
    ;(invoices ?? []).forEach((i) => i.customer_id && count.set(i.customer_id, (count.get(i.customer_id) ?? 0) + 1))
    return [...customers].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)).slice(0, 6)
  }, [invoices, customers])

  const overdue = useMemo(() => overdueByUrgency(invoices ?? []), [invoices])

  async function checkNow() {
    setWaiting(true)
    setBankMsg('')
    try {
      const r = await store.runBankSync()
      setBankMsg(r.status === 'ok' ? `${t('bankChecked')} · ${r.matched} ${t('bankFoundPaid')}` : t('bankNeedsApproval'))
    } catch (e) {
      setBankMsg(te(e))
    } finally {
      setWaiting(false)
      qc.invalidateQueries({ queryKey: keys.invoices })
      qc.invalidateQueries({ queryKey: keys.bank })
    }
  }

  const month = todayISO().slice(0, 7)
  const valid = invoices ?? []
  const monthSum = valid.filter((i) => i.issue_date.startsWith(month)).reduce((s, i) => s + i.totals.gross, 0)
  const monthCount = valid.filter((i) => i.issue_date.startsWith(month) && i.kind === 'invoice').length
  const open = valid.filter(isOpen)
  const openSum = open.reduce((s, i) => s + i.totals.gross, 0)

  return (
    <>
      <TopBar title={company?.name ?? t('appName')} />
      <Page>
        <div className="mb-5 grid grid-cols-2 gap-3">
          <Card>
            <div className="text-[13px] text-muted">{t('thisMonth')}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{fmtEUR(monthSum)}</div>
            <div className="text-[13px] text-muted">
              {monthCount} {t('invoicesCount')}
            </div>
          </Card>
          <Link to="/invoices?filter=open">
            <Card className="h-full">
              <div className="text-[13px] text-muted">{t('openAmount')}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{fmtEUR(openSum)}</div>
              <div className="text-[13px] text-muted">
                {open.length} {t('invoicesCount')}
              </div>
            </Card>
          </Link>
        </div>

        {isOwner && bank?.status === 'needs_approval' && (
          <Card className="-mt-2 mb-5 border-accent bg-accent/15">
            <p className="text-[15px] font-semibold">🏦 {t('bankApprovalDue')}</p>
            <p className="mb-3 text-sm">{t('bankNeedsApproval')}</p>
            <button onClick={checkNow} className="min-h-11 w-full rounded-xl bg-accent font-semibold text-accent-ink">
              {t('bankCheckNow')}
            </button>
          </Card>
        )}
        {isOwner && bank && bank.status !== 'needs_approval' && (
          <div className="-mt-2 mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-2.5 text-sm">
            <Link to="/settings" className="min-w-0 truncate">
              <span className={bank.status === 'ok' ? 'text-ok' : 'text-danger'}>●</span> 🏦 {t('bankAutoOn')} · {fmtTime(bank.last_sync_at, lang)}
            </Link>
            <button onClick={checkNow} className="shrink-0 font-semibold underline">
              {t('bankCheckNow')}
            </button>
          </div>
        )}
        {bankMsg && <p className="-mt-3 mb-4 px-1 text-sm text-muted">{bankMsg}</p>}
        {isOwner && !bank && open.length > 0 && (
          <Link to="/bank" className="-mt-2 mb-5 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-semibold">
            🏦 {t('bankImport')}
          </Link>
        )}
        <ApprovalOverlay show={waiting} />
        {isOwner && company && backupDue(company.last_backup_at, valid.length) && (
          <Card className="mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">💾 {t('backupDue')}</p>
              <p className="text-sm text-muted">{t('backupDueHint')}</p>
            </div>
            <button
              disabled={backingUp}
              onClick={async () => {
                setBackingUp(true)
                try {
                  await downloadFullBackup()
                  setCompany({ ...company, last_backup_at: new Date().toISOString() })
                } finally {
                  setBackingUp(false)
                }
              }}
              className="min-h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-bg disabled:opacity-50"
            >
              {backingUp ? '…' : 'ZIP'}
            </button>
          </Card>
        )}

        <Link to="/invoices/new" className="mb-6 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-bold text-accent-ink">
          <IconPlus /> {t('newInvoice')}
        </Link>

        {overdue.length > 0 && (
          <Section title={`${t('needsAttention')} (${overdue.length})`}>
            <Card className="p-0" >
              {overdue.slice(0, 5).map((i) => {
                const due = reminderDue(i)
                const days = daysOverdue(i)
                return (
                  <Link
                    key={i.id}
                    to={due ? `/invoices/${i.id}/reminder` : `/invoices/${i.id}`}
                    data-testid="overdue-row"
                    className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 active:opacity-60"
                  >
                    <span className={'h-10 w-1.5 shrink-0 rounded-full ' + (days > 30 ? 'bg-danger' : days > 14 ? 'bg-accent' : 'bg-line')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-[15px] font-semibold">
                        <span className="truncate">{i.customer?.company_name || i.customer?.name || i.number}</span>
                        <span className="shrink-0 tabular-nums">{fmtEUR(i.totals.gross)}</span>
                      </div>
                      <div className="truncate text-[13px] text-muted">
                        {days} {t('daysOverdue')}
                        {(i.reminder_count ?? 0) > 0 && ` · ${i.reminder_count}× ${t('reminded')} (${fmtDate(i.last_reminder_at)})`}
                      </div>
                    </div>
                    {due && (
                      <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[12px] font-bold text-accent-ink">
                        {levelTitle(nextLevel(i)).replace('Zahlungserinnerung', t('reminderShort'))} ›
                      </span>
                    )}
                  </Link>
                )
              })}
            </Card>
          </Section>
        )}

        {regulars.length > 0 && (
          <Section title={t('quickActions')} right={<Link to="/customers" className="text-sm font-medium underline">{t('customers')}</Link>}>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {regulars.map((c) => (
                <Link
                  key={c.id}
                  to={`/invoices/new?customer=${c.id}`}
                  className="flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-medium"
                >
                  <IconUsers />
                  <span className="max-w-40 truncate">{c.company_name || c.name}</span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        <Section title={t('recent')} right={<Link to="/invoices" className="text-sm font-medium underline">{t('showAll')}</Link>}>
          {invoices === null ? (
            invoicesQ.isError ? <Empty>{t('loadError')}</Empty> : <Empty>{t('loading')}</Empty>
          ) : invoices.length === 0 ? (
            <Empty>{t('noInvoices')}</Empty>
          ) : (
            <Card className="p-0">
              {invoices.slice(0, 8).map((i) => (
                <InvoiceRow key={i.id} inv={i} />
              ))}
            </Card>
          )}
        </Section>
      </Page>
    </>
  )
}
