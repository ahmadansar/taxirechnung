// Public page the customer opens from the invoice link (no login).
// Shows the amount and the company's bank details for a direct transfer, plus a GiroCode.
import { useCallback, useEffect, useState } from 'react'
import { IconCar } from '../components/icons'
import { Button, Card, ErrorText, Segmented } from '../components/ui'
import { useI18n, type Lang } from '../lib/i18n'
import { centsToInput, fmtDate, fmtEUR } from '../lib/money'
import { epcPayload, qrPng } from '../lib/qr'
import { downloadBlob } from '../lib/share'
import { store } from '../lib/store'
import type { PayInfo } from '../lib/types'

const fmtIban = (iban: string) => iban.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()

function CopyRow({ label, value, copyValue, mono }: { label: string; value: string; copyValue?: string; mono?: boolean }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue ?? value)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      /* clipboard blocked: value is selectable */
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className={'select-all break-words text-[15px] font-semibold ' + (mono ? 'font-mono tracking-tight' : '')}>{value}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="min-h-10 shrink-0 rounded-lg border border-line px-3 text-sm font-medium active:bg-soft"
      >
        {done ? '✓' : t('copy')}
      </button>
    </div>
  )
}

export default function PayPage({ token }: { token: string }) {
  const { t, te, lang, setLang } = useI18n()
  const [info, setInfo] = useState<PayInfo | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setInfo(await store.payInfo(token))
      setError('')
    } catch (e) {
      setError(te(e))
    }
  }, [token, te])

  useEffect(() => {
    load()
  }, [load])

  const open = info && !info.paid && !info.cancelled && info.amount_cents > 0 && !!info.iban
  const reference = info ? `Rechnung ${info.number}` : ''

  useEffect(() => {
    if (!open || !info) return setQr(null)
    qrPng(epcPayload(info.account_holder, info.iban, info.bic, info.amount_cents, reference)).then(setQr)
  }, [open, info, reference])

  async function saveQr() {
    if (!qr || !info) return
    const blob = await (await fetch(qr)).blob()
    downloadBlob(blob, `GiroCode_${info.number}.png`)
  }

  return (
    <div className="pt-safe mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink">
            <IconCar />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold">{info?.company || t('payTitle')}</div>
            {info?.company_city && <div className="text-sm text-muted">{info.company_city}</div>}
          </div>
        </div>
        <div className="w-24 shrink-0">
          <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'de', label: 'DE' }, { value: 'en', label: 'EN' }]} />
        </div>
      </div>

      {!info && !error && <p className="text-center text-muted">{t('loading')}</p>}
      <ErrorText>{error}</ErrorText>

      {info && (
        <div className="space-y-4">
          <Card>
            <div className="text-[15px] font-semibold">
              {t('invoiceNo')} {info.number}
            </div>
            <div className="text-sm text-muted">
              {fmtDate(info.issue_date)}
              {info.customer && ` · ${info.customer}`}
            </div>
            <div className="mt-3 text-4xl font-extrabold tabular-nums">{fmtEUR(info.amount_cents)}</div>
            {open && info.due_date && (
              <div className="mt-1 text-sm text-muted">
                {t('dueDate')} {fmtDate(info.due_date)}
              </div>
            )}
            {info.paid && (
              <div className="mt-4 rounded-xl bg-ok/10 px-4 py-4 text-center text-lg font-bold text-ok">
                ✓ {t('payPaid')}
                {info.paid_at && <div className="text-sm font-medium">{fmtDate(info.paid_at)}</div>}
              </div>
            )}
            {info.cancelled && <p className="mt-4 rounded-xl bg-soft px-3 py-3 text-[15px]">{t('payCancelled')}</p>}
            {!info.paid && !info.cancelled && !info.iban && <p className="mt-4 rounded-xl bg-soft px-3 py-3 text-[15px]">{t('payNoIban')}</p>}
          </Card>

          {open && (
            <>
              <Card>
                <p className="mb-1 text-sm text-muted">{t('payTransferIntro')}</p>
                <CopyRow label={t('payRecipient')} value={info.account_holder} />
                <CopyRow label="IBAN" value={fmtIban(info.iban)} copyValue={info.iban.replace(/\s/g, '')} mono />
                {info.bic && <CopyRow label="BIC" value={info.bic} mono />}
                <CopyRow label={t('payAmount')} value={fmtEUR(info.amount_cents)} copyValue={centsToInput(info.amount_cents)} />
                <CopyRow label={t('payReference')} value={reference} />
              </Card>

              {qr && (
                <Card className="flex flex-col items-center gap-3 text-center">
                  <div className="text-[15px] font-semibold">{t('payGiroTitle')}</div>
                  <img src={qr} alt="GiroCode" className="h-52 w-52 rounded-lg bg-white p-2" />
                  <p className="text-sm text-muted">{t('payGiroHint')}</p>
                  <Button variant="secondary" onClick={saveQr}>
                    {t('paySaveQr')}
                  </Button>
                </Card>
              )}
            </>
          )}

          {!info.paid && !info.cancelled && (
            <button onClick={load} className="w-full py-2 text-sm text-muted underline">
              {t('refreshStatus')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
