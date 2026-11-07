import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, ErrorText, Page, Section, TopBar } from '../components/ui'
import { decodeBankFile, isMatchable, type Match, matchPayments, parseStatement } from '../lib/bank'
import { useI18n } from '../lib/i18n'
import { fmtDate, fmtEUR } from '../lib/money'
import { store } from '../lib/store'
import { keys, queryClient } from '../lib/queries'

const who = (m: Match) => (m.invoice.customer ? m.invoice.customer.company_name || m.invoice.customer.name : '')

export default function BankImport() {
  const { t, te, lang } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [incoming, setIncoming] = useState<number | null>(null)
  const [done, setDone] = useState<Match[]>([])
  const [review, setReview] = useState<Match[]>([])
  const [stillOpen, setStillOpen] = useState(0)

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError('')
    setFileName(file.name)
    try {
      const txs = parseStatement(decodeBankFile(await file.arrayBuffer()))
      if (!txs.length) throw new Error('bankUnreadable')
      const invoices = await store.listInvoices()
      const r = matchPayments(txs, invoices)
      for (const m of r.auto) await store.setPaid(m.invoice.id, true, { via: 'bank', paidAt: m.tx.date })
      queryClient.invalidateQueries({ queryKey: keys.invoices })
      setIncoming(r.incoming)
      setDone(r.auto)
      setReview(r.review)
      setStillOpen(invoices.filter(isMatchable).length - r.auto.length)
    } catch (e) {
      setError(e instanceof Error && e.message === 'bankUnreadable' ? t('bankUnreadable') : te(e))
      setIncoming(null)
    } finally {
      setBusy(false)
    }
  }

  // Demo: build a small sample statement that pays the currently open invoices
  async function demoFile() {
    const open = (await store.listInvoices()).filter(isMatchable)
    const d = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const rows = open.map((i) =>
      [d, d, i.customer?.company_name || i.customer?.name || 'Kunde', 'GUTSCHRIFT', `Rechnung ${i.number}`, (i.totals.gross / 100).toFixed(2).replace('.', ','), 'EUR'].map((c) => `"${c}"`).join(';'),
    )
    const csv = ['"Buchungstag";"Valutadatum";"Beguenstigter/Zahlungspflichtiger";"Buchungstext";"Verwendungszweck";"Betrag";"Waehrung"', ...rows].join('\n')
    onFile(new File([csv], 'Beispiel-Kontoauszug.csv', { type: 'text/csv' }))
  }

  async function confirm(m: Match) {
    await store.setPaid(m.invoice.id, true, { via: 'bank', paidAt: m.tx.date })
    queryClient.invalidateQueries({ queryKey: keys.invoices })
    setReview((r) => r.filter((x) => x !== m))
    setDone((d) => [...d, m])
    setStillOpen((n) => n - 1)
  }
  async function undo(m: Match) {
    await store.setPaid(m.invoice.id, false)
    queryClient.invalidateQueries({ queryKey: keys.invoices })
    setDone((d) => d.filter((x) => x !== m))
    setStillOpen((n) => n + 1)
  }

  const reasonText = (m: Match) =>
    m.reason === 'amount_differs'
      ? `${lang === 'de' ? 'Betrag weicht ab' : 'Amount differs'}: ${fmtEUR(m.tx.amountCents)} ≠ ${fmtEUR(m.invoice.totals.gross)}`
      : lang === 'de'
        ? 'Gleicher Betrag und Kundenname, aber keine Rechnungsnummer'
        : 'Same amount and customer name, but no invoice number'

  return (
    <>
      <TopBar title={t('bankImport')} back="/invoices" />
      <Page>
        <Card className="mb-5 space-y-3">
          <p className="text-[15px] leading-relaxed">{t('bankImportHint')}</p>
          <p className="text-sm text-muted">{t('bankHowTo')}</p>
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-ink">
            {busy ? t('loading') : t('bankChooseFile')}
            <input
              id="bank-file"
              type="file"
              accept=".csv,.txt,.xml,.camt,.053,.052,text/csv,application/xml,text/xml"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                onFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {store.mode === 'demo' && (
            <button type="button" onClick={demoFile} disabled={busy} className="w-full text-center text-sm text-muted underline">
              {lang === 'de' ? 'Demo: Beispiel-Kontoauszug verwenden' : 'Demo: use a sample statement'}
            </button>
          )}
          {fileName && <p className="truncate text-center text-xs text-muted">{fileName}</p>}
          <ErrorText>{error}</ErrorText>
        </Card>

        {incoming !== null && (
          <>
            <p className="mb-4 px-1 text-sm text-muted">
              {incoming} {t('bankRead')}
            </p>

            <Section title={`${t('bankAutoPaid')} (${done.length})`}>
              {done.length === 0 ? (
                <p className="px-1 text-sm text-muted">{t('bankNoMatches')}</p>
              ) : (
                <Card className="p-0">
                  {done.map((m) => (
                    <div key={m.invoice.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link to={`/invoices/${m.invoice.id}`} className="truncate text-[15px] font-semibold underline-offset-2 hover:underline">
                            {m.invoice.number}
                          </Link>
                          <Badge tone="ok">✓ {t('paid')}</Badge>
                        </div>
                        <div className="truncate text-[13px] text-muted">
                          {[who(m), fmtDate(m.tx.date), m.tx.name].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[15px] font-semibold tabular-nums">{fmtEUR(m.invoice.totals.gross)}</div>
                        <button onClick={() => undo(m)} className="text-xs text-muted underline">
                          {t('bankUndo')}
                        </button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </Section>

            {review.length > 0 && (
              <Section title={`${t('bankReview')} (${review.length})`}>
                <p className="mb-2 px-1 text-xs text-muted">{t('bankReviewHint')}</p>
                <div className="space-y-2">
                  {review.map((m) => (
                    <Card key={m.invoice.id} className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold">
                            {m.invoice.number} · {fmtEUR(m.invoice.totals.gross)}
                          </div>
                          <div className="text-[13px] text-muted">{who(m)}</div>
                        </div>
                        <Button className="min-h-10 shrink-0 px-3 text-sm" onClick={() => confirm(m)}>
                          ✓ {t('bankConfirm')}
                        </Button>
                      </div>
                      <div className="rounded-lg bg-soft px-3 py-2 text-[13px]">
                        <div className="font-medium">
                          {fmtDate(m.tx.date)} · {fmtEUR(m.tx.amountCents)} {m.tx.name && `· ${m.tx.name}`}
                        </div>
                        <div className="line-clamp-2 text-muted">{m.tx.text}</div>
                      </div>
                      <p className="text-xs text-muted">{reasonText(m)}</p>
                    </Card>
                  ))}
                </div>
              </Section>
            )}

            <Link to="/invoices?filter=open" className="block rounded-xl border border-line bg-card px-4 py-3 text-[15px]">
              {t('bankStillOpen')}: <b>{Math.max(0, stillOpen)}</b> →
            </Link>
          </>
        )}
      </Page>
    </>
  )
}
