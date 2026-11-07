import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { store } from '../lib/store'
import { keys, queryClient } from '../lib/queries'
import type { BankConnection as Conn } from '../lib/types'
import { Badge, Button, Card, ErrorText, Field, Input, Section } from './ui'

const VOLKSBANK_URL = 'https://fints1.atruvia.de/cgi-bin/hbciservlet'

export function fmtTime(iso: string | null, lang: string) {
  if (!iso) return '–'
  return new Date(iso).toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Full-screen hint while the bank waits for the approval in the banking app. */
export function ApprovalOverlay({ show }: { show: boolean }) {
  const { t } = useI18n()
  if (!show) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-line border-t-accent" />
        <p className="text-lg font-bold">{t('bankApproveNow')}</p>
        <p className="mt-2 text-sm text-muted">{t('bankApproveHint')}</p>
      </div>
    </div>
  )
}

export function BankConnectionSection() {
  const { t, te, lang } = useI18n()
  const { company } = useSession()
  const [conn, setConn] = useState<Conn | null | undefined>(undefined)
  const [login, setLogin] = useState('')
  const [pin, setPin] = useState('')
  const [url, setUrl] = useState(VOLKSBANK_URL)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: keys.bank })
    return store.getBankConnection().then(setConn).catch(() => setConn(null))
  }
  useEffect(() => {
    reload()
  }, [])

  const iban = (company?.iban ?? '').replace(/\s/g, '')

  async function connect() {
    setError('')
    setInfo('')
    setWaiting(true)
    try {
      const r = await store.connectBank({ iban, login, pin, url })
      setPin('')
      setInfo(`${t('bankConnected')} ${r.matched > 0 ? `· ${r.matched} ${t('bankFoundPaid')}` : ''}`)
      await reload()
    } catch (e) {
      setError(te(e))
    } finally {
      setWaiting(false)
    }
  }
  async function runNow() {
    setError('')
    setInfo('')
    setWaiting(true)
    try {
      const r = await store.runBankSync()
      setInfo(r.status === 'ok' ? `${t('bankChecked')} · ${r.matched} ${t('bankFoundPaid')}` : t('bankNeedsApproval'))
    } catch (e) {
      setError(te(e))
    } finally {
      setWaiting(false)
      reload()
    }
  }
  async function disconnect() {
    await store.disconnectBank()
    reload()
  }

  return (
    <Section title={t('bankAutoTitle')}>
      <Card className="space-y-4">
        <p className="text-sm text-muted">{t('bankAutoHint')}</p>
        {store.mode === 'demo' && <p className="rounded-lg bg-accent/20 px-3 py-2 text-sm">{t('bankDemoHint')}</p>}

        {conn === undefined ? null : conn ? (
          <>
            <div className="rounded-xl bg-soft p-3">
              <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                {conn.bank_name || conn.bank_code}
                {conn.status === 'ok' && <Badge tone="ok">✓ {t('connected')}</Badge>}
                {conn.status === 'needs_approval' && <Badge tone="warn">{t('bankApprovalDue')}</Badge>}
                {conn.status === 'error' && <Badge tone="danger">{t('error')}</Badge>}
              </div>
              <div className="mt-1 text-sm text-muted">
                {conn.iban} · {conn.tan_method_name}
              </div>
              <div className="text-sm text-muted">
                {t('bankLastCheck')}: {fmtTime(conn.last_sync_at, lang)}
                {conn.last_matched > 0 && ` · ${conn.last_matched} ${t('bankFoundPaid')}`}
              </div>
              {conn.status === 'needs_approval' && <p className="mt-2 text-sm">{t('bankNeedsApproval')}</p>}
              {conn.last_error && <p className="mt-2 text-sm text-danger">{conn.last_error}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={runNow} disabled={waiting}>
                {t('bankCheckNow')}
              </Button>
              <Button type="button" variant="secondary" onClick={disconnect} disabled={waiting}>
                {t('disconnect')}
              </Button>
            </div>
          </>
        ) : !iban ? (
          <p className="rounded-lg bg-soft px-3 py-2 text-sm">{t('needIbanForLink')}</p>
        ) : store.mode === 'cloud' && !company?.fints_product_id ? (
          <p className="rounded-lg bg-soft px-3 py-2 text-sm">{t('bankNeedsProductId')}</p>
        ) : (
          <>
            <Field label="IBAN">
              <Input value={iban.replace(/(.{4})/g, '$1 ').trim()} readOnly className="font-mono" />
            </Field>
            <Field label={t('bankLogin')} hint={t('bankLoginHint')}>
              <Input id="bank-login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} />
            </Field>
            <Field label="PIN">
              <Input id="bank-pin" type="password" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} />
            </Field>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">{t('bankAdvanced')}</summary>
              <Field label={t('bankServer')} className="mt-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono text-sm" />
              </Field>
            </details>
            <p className="text-xs text-muted">🔒 {t('bankSecurityNote')}</p>
            <Button type="button" block onClick={connect} disabled={waiting || !login || !pin}>
              {t('bankConnect')}
            </Button>
          </>
        )}
        <ErrorText>{error}</ErrorText>
        {info && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}
      </Card>
      <ApprovalOverlay show={waiting} />
    </Section>
  )
}
