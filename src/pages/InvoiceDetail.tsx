import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useConfirm } from '../components/Confirm'
import { PaidButton, useInvoiceStatus } from '../components/InvoiceRow'
import { IconDownload, IconRepeat, IconShare } from '../components/icons'
import { Button, Card, Empty, ErrorText, Page, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useIsOwner } from '../lib/session'
import { fmtDate, fmtEUR, lineTotal } from '../lib/money'
import { buildInvoicePdf, invoiceFilename, type PdfExtras } from '../lib/pdf'
import { isOpenForPayment, pdfExtras } from '../lib/qr'
import { payLinkFor } from '../lib/store/common'
import { downloadBlob, inArtifact, shareFile } from '../lib/share'
import { store } from '../lib/store'
import type { Invoice } from '../lib/types'
import { putInvoice, useInvoice, useInvoices } from '../lib/queries'
import { isOverdue } from '../lib/reminder'
import { useQueryClient } from '@tanstack/react-query'
import { buildXRechnung, isB2B, xrechnungFilename, xrechnungMissing } from '../lib/xrechnung'

export default function InvoiceDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { t, te } = useI18n()
  const isOwner = useIsOwner()
  const nav = useNavigate()
  const status = useInvoiceStatus()
  const qc = useQueryClient()
  const one = useInvoice(id)
  const all = useInvoices()
  const inv: Invoice | null | undefined = one.data !== undefined ? one.data : one.isError ? null : undefined
  const related: Invoice | null =
    (inv && all.data?.find((x) => (inv.kind === 'storno' ? x.id === inv.storno_of : inv.status === 'cancelled' && x.storno_of === inv.id))) || null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog } = useConfirm()
  const [extras, setExtras] = useState<PdfExtras>({})
  const [extrasFor, setExtrasFor] = useState<string | null>(null)
  const [archivedPdf, setArchivedPdf] = useState<Blob | null>(null)
  const archiving = useRef(false)
  const [copied, setCopied] = useState(false)

  const byTransfer = !!inv && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account')
  const payUrl = inv && byTransfer && isOpenForPayment(inv) && inv.payment_token && inv.seller.iban ? payLinkFor(inv.payment_token) : null

  // QR codes for the PDF (payment link + GiroCode)
  useEffect(() => {
    if (!inv) return
    pdfExtras(inv, payUrl)
      .catch(() => ({}))
      .then((x) => {
        setExtras(x)
        setExtrasFor(inv.id)
      })
  }, [inv, payUrl])

  // GoBD: store the issued PDF (+ XRechnung) once, unchangeable; afterwards always use that copy
  useEffect(() => {
    if (!inv || !store.archiveInvoice || inv.archived_at || extrasFor !== inv.id || archiving.current) return
    archiving.current = true
    const pdfBlob = buildInvoicePdf(inv, extras)
    const xml = isB2B(inv) && xrechnungMissing(inv).length === 0 ? buildXRechnung(inv) : undefined
    store
      .archiveInvoice(inv, { pdf: pdfBlob, xml })
      .then((at) => {
        setArchivedPdf(pdfBlob)
        putInvoice(qc, { ...inv, archived_at: at })
      })
      .catch(() => {
        archiving.current = false // retry next time the invoice is opened
      })
  }, [inv, extras, extrasFor])

  useEffect(() => {
    if (inv?.archived_at && !archivedPdf && store.getArchivedFile) store.getArchivedFile(inv, 'pdf').then(setArchivedPdf)
  }, [inv, archivedPdf])


  if (inv === undefined) return <Empty>{t('loading')}</Empty>
  if (inv === null) return <Empty>{t('noResults')}</Empty>

  const pdf = () => archivedPdf ?? buildInvoicePdf(inv, extras)
  const b2b = isB2B(inv)
  const xrMissing = b2b ? xrechnungMissing(inv) : []
  async function downloadXml() {
    const archived = store.getArchivedFile ? await store.getArchivedFile(inv!, 'xml') : null
    downloadBlob(archived ?? new Blob([buildXRechnung(inv!)], { type: 'application/xml' }), xrechnungFilename(inv!))
  }
  const who = inv.customer ? inv.customer.company_name || inv.customer.name : t('walkIn')
  const canMarkPaid = inv.kind === 'invoice' && inv.status === 'issued' && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account')

  async function share() {
    setError('')
    try {
      const text = `${t('shareText')} ${inv!.number} – ${inv!.seller.name}` + (payUrl ? `\n${t('payLinkText')}: ${payUrl}` : '')
      await shareFile(pdf(), invoiceFilename(inv!), `Rechnung ${inv!.number}`, text)
    } catch (e) {
      setError(te(e))
    }
  }
  function preview() {
    if (inArtifact()) return downloadBlob(pdf(), invoiceFilename(inv!))
    const url = URL.createObjectURL(pdf())
    if (!window.open(url, '_blank')) downloadBlob(pdf(), invoiceFilename(inv!))
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  async function copyLink() {
    if (!payUrl) return
    try {
      await navigator.clipboard.writeText(payUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked: the link is selectable text */
    }
  }
  async function cancel() {
    if (!(await ask(t('cancelConfirm'), t('cancelInvoice')))) return
    setBusy(true)
    try {
      const storno = await store.cancelInvoice(inv!.id)
      await qc.invalidateQueries({ queryKey: ['invoices'] })
      nav(`/invoices/${storno.id}?new=1`, { replace: true })
    } catch (e) {
      setError(te(e))
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title={inv.number} back="/invoices" right={status(inv)} />
      <Page>
        {params.get('new') && (
          <div className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-[15px] font-medium text-ok">
            ✓ {inv.kind === 'storno' ? t('stornoCreated') : t('invoiceCreated')}: {inv.number}
          </div>
        )}

        <Card className="mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-lg font-bold">{who}</div>
              {inv.customer && (
                <div className="text-sm text-muted">
                  {[inv.customer.company_name && inv.customer.name, inv.customer.street, [inv.customer.zip, inv.customer.city].filter(Boolean).join(' ')]
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{fmtEUR(inv.totals.gross)}</div>
              <div className="text-xs text-muted">{t(`pm_${inv.payment_method}`)}</div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">{t('issueDate')}</dt>
            <dd>{fmtDate(inv.issue_date)}</dd>
            <dt className="text-muted">{t('serviceDate').split(' (')[0]}</dt>
            <dd>
              {fmtDate(inv.trip.date)}
              {inv.trip.time && `, ${inv.trip.time}`}
            </dd>
            {(inv.trip.from || inv.trip.to) && (
              <>
                <dt className="text-muted">{t('trip')}</dt>
                <dd>{[inv.trip.from, inv.trip.to].filter(Boolean).join(' → ')}{inv.trip.km != null && ` · ${String(inv.trip.km).replace('.', ',')} km`}</dd>
              </>
            )}
            {inv.due_date && !inv.paid && inv.kind === 'invoice' && (
              <>
                <dt className="text-muted">{t('dueDate')}</dt>
                <dd>{fmtDate(inv.due_date)}</dd>
              </>
            )}
            {inv.reference && (
              <>
                <dt className="text-muted">{t('reference')}</dt>
                <dd>{inv.reference}</dd>
              </>
            )}
          </dl>

          <div className="mt-4 border-t border-line pt-3 text-sm">
            {inv.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3 py-1">
                <span className="min-w-0">
                  {it.quantity !== 1 && `${String(it.quantity).replace('.', ',')} × `}
                  {it.description}
                  {!inv.seller.small_business && <span className="text-muted"> · {it.vat_rate} %</span>}
                </span>
                <span className="tabular-nums">{fmtEUR(lineTotal(it))}</span>
              </div>
            ))}
            {!inv.seller.small_business &&
              inv.totals.lines.map((l) => (
                <div key={l.rate} className="flex justify-between py-0.5 text-muted">
                  <span>
                    {t('vat')} {l.rate} % ({t('net')} {fmtEUR(l.net)})
                  </span>
                  <span className="tabular-nums">{fmtEUR(l.vat)}</span>
                </div>
              ))}
          </div>
        </Card>

        {inv.paid && inv.paid_via === 'bank' && (
          <div className="mb-4 rounded-xl bg-ok/10 px-3 py-2 text-[15px] font-semibold text-ok">
            ✓ {inv.paid_via === 'bank' ? t('paidBank') : t('paid')}
            {inv.paid_at && ` · ${fmtDate(inv.paid_at)}`}
          </div>
        )}

        {payUrl && inv.payment_token && (
          <Card className="mb-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t('payLink')}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> {t('open')}
              </span>
            </div>
            <div className="select-all break-all rounded-lg bg-soft px-3 py-2 font-mono text-[13px]">{payUrl}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={copyLink}>
                {copied ? '✓ ' + t('copied') : t('copy')}
              </Button>
              <Link
                to={`/pay/${inv.payment_token}`}
                className="flex min-h-12 items-center justify-center rounded-xl border border-line bg-card px-2 text-center text-[15px] font-semibold"
              >
                {t('preview')} ↗
              </Link>
            </div>
            <p className="text-xs text-muted">{t('waitingPayment')}</p>
          </Card>
        )}

        {canMarkPaid && !inv.paid && !inv.seller.iban && (
          <Link to="/settings" className="mb-4 block rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted">
            🏦 {t('needIbanForLink')}
          </Link>
        )}

        {related && (
          <Link to={`/invoices/${related.id}`} className="mb-4 block rounded-xl bg-soft px-3 py-2 text-sm">
            {inv.kind === 'storno' ? '← ' + t('invoiceNo') : t('storno') + ':'} <b>{related.number}</b>
          </Link>
        )}

        <div className="space-y-2">
          <PaidButton inv={inv} large />
          {canMarkPaid && <p className="pb-1 text-center text-xs text-muted">{inv.paid ? t('tapToMarkOpen') : t('tapToMarkPaid')}</p>}
          <Button block onClick={share}>
            <IconShare /> {t('share')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={preview}>
              {t('preview')}
            </Button>
            <Button variant="secondary" onClick={() => downloadBlob(pdf(), invoiceFilename(inv))}>
              <IconDownload /> PDF
            </Button>
          </div>
          {b2b && (
            <Card className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">{t('eInvoice')}</span>
                <span className="text-xs text-muted">XRechnung 3.0 · EN 16931</span>
              </div>
              {xrMissing.length === 0 ? (
                <>
                  <p className="text-sm text-muted">{t('eInvoiceHint')}</p>
                  <Button variant="secondary" block onClick={downloadXml}>
                    <IconDownload /> {t('eInvoiceDownload')}
                  </Button>
                </>
              ) : (
                <div className="text-sm">
                  <p className="text-muted">{t('eInvoiceMissing')}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {xrMissing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-3">
                    <Link to="/settings" className="font-semibold underline">
                      {t('navSettings')}
                    </Link>
                    {inv.customer_id && (
                      <Link to={`/customers/${inv.customer_id}/edit`} className="font-semibold underline">
                        {t('editCustomer')}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}
          {isOverdue(inv) && (
            <Link to={`/invoices/${inv.id}/reminder`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-semibold text-accent-ink">
              ✉ {t('sendReminder')}
              {(inv.reminder_count ?? 0) > 0 && ` (${inv.reminder_count}× ${t('reminded')})`}
            </Link>
          )}
          {inv.kind === 'invoice' && (
            <Link to={`/invoices/new?from=${inv.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-card text-[15px] font-semibold">
              <IconRepeat /> {t('repeat')}
            </Link>
          )}
          {isOwner && inv.kind === 'invoice' && inv.status === 'issued' && (
            <Button variant="danger" block disabled={busy} onClick={cancel}>
              {t('cancelInvoice')}
            </Button>
          )}
          <ErrorText>{error}</ErrorText>
          <p className="px-1 pt-2 text-xs leading-relaxed text-muted">
            {t('immutableHint')}
            {inv.archived_at && ` ${t('archivedOn')} ${fmtDate(inv.archived_at)}.`}
          </p>
        </div>
      </Page>
      {dialog}
    </>
  )
}
