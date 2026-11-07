// Proposal → human approval: the app drafts the reminder, the user checks/edits it and only then sends it.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Empty, ErrorText, Field, Page, Textarea, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { fmtDate, fmtEUR } from '../lib/money'
import { buildInvoicePdf, invoiceFilename, type PdfExtras } from '../lib/pdf'
import { pdfExtras } from '../lib/qr'
import { useInvoice, useMarkReminded } from '../lib/queries'
import { buildReminderPdf, daysOverdue, isOverdue, levelTitle, nextLevel, proposeReminderText, reminderDueDate, reminderFilename } from '../lib/reminder'
import { downloadBlob, inArtifact, shareFiles } from '../lib/share'
import { payLinkFor } from '../lib/store/common'

export default function ReminderPage() {
  const { id } = useParams()
  const { t, te } = useI18n()
  const nav = useNavigate()
  const q = useInvoice(id)
  const inv = q.data
  const marked = useMarkReminded()
  const level = inv ? nextLevel(inv) : 1
  const newDue = useMemo(() => reminderDueDate(), [])
  const [text, setText] = useState('')
  const [extras, setExtras] = useState<PdfExtras>({})
  const [error, setError] = useState('')
  const [sentInfo, setSentInfo] = useState('')

  useEffect(() => {
    if (inv && !text) setText(proposeReminderText(inv, level, newDue))
  }, [inv, text, level, newDue])
  useEffect(() => {
    if (inv) pdfExtras(inv, inv.payment_token ? payLinkFor(inv.payment_token) : null).then(setExtras).catch(() => setExtras({}))
  }, [inv])

  if (inv === undefined) return <Empty>{q.isError ? t('loadError') : t('loading')}</Empty>
  if (inv === null) return <Empty>{t('noResults')}</Empty>

  const title = levelTitle(level)
  const who = inv.customer?.company_name || inv.customer?.name || t('walkIn')
  const pdf = () => buildReminderPdf(inv, level, text, newDue, extras)

  async function approve() {
    setError('')
    try {
      const files = [
        { blob: pdf(), name: reminderFilename(inv!, level) },
        { blob: buildInvoicePdf(inv!, extras), name: invoiceFilename(inv!) },
      ]
      const r = await shareFiles(files, `${title} ${inv!.number}`, `${title} zur Rechnung ${inv!.number} – ${inv!.seller.name}`)
      if (r === 'cancelled') return
      await marked.mutateAsync(inv!.id)
      setSentInfo(r === 'shared' ? t('reminderSent') : t('reminderDownloaded'))
    } catch (e) {
      setError(te(e))
    }
  }
  function preview() {
    const blob = pdf()
    if (inArtifact()) return downloadBlob(blob, reminderFilename(inv!, level))
    const url = URL.createObjectURL(blob)
    if (!window.open(url, '_blank')) downloadBlob(blob, reminderFilename(inv!, level))
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      <TopBar title={title} back={`/invoices/${inv.id}`} />
      <Page>
        {!isOverdue(inv) ? (
          <Empty>{t('reminderNotNeeded')}</Empty>
        ) : sentInfo ? (
          <Card className="space-y-3 text-center">
            <p className="text-lg font-bold text-ok">✓ {sentInfo}</p>
            <p className="text-sm text-muted">
              {t('reminderNextHint')} {fmtDate(newDue)}
            </p>
            <Button block onClick={() => nav('/')}>
              {t('navHome')}
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="space-y-1">
              <div className="flex justify-between gap-2 text-[15px] font-semibold">
                <span className="truncate">{who}</span>
                <span className="tabular-nums">{fmtEUR(inv.totals.gross)}</span>
              </div>
              <p className="text-sm text-muted">
                {inv.number} · {daysOverdue(inv)} {t('daysOverdue')}
                {(inv.reminder_count ?? 0) > 0 && ` · ${inv.reminder_count}× ${t('reminded')}`}
              </p>
            </Card>
            <p className="rounded-xl bg-accent/15 px-3 py-2 text-sm">💡 {t('reminderProposalHint')}</p>
            <Field label={t('reminderText')}>
              <Textarea id="reminder-text" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            {!inv.customer?.email && <p className="text-sm text-muted">{t('reminderNoEmail')}</p>}
            <ErrorText>{error}</ErrorText>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={preview}>
                {t('preview')}
              </Button>
              <Button variant="secondary" onClick={() => nav(-1)}>
                {t('notNow')}
              </Button>
            </div>
            <Button block onClick={approve} disabled={marked.isPending || !text.trim()}>
              ✓ {t('reminderApprove')}
            </Button>
          </div>
        )}
      </Page>
    </>
  )
}
