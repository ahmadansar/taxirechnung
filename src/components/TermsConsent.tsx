import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { store } from '../lib/store'
import { TERMS_VERSION } from '../legal/operator'
import { Button, Card, ErrorText, Page, TopBar } from './ui'

export const termsStamp = () => ({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })

/** Required checkbox: AGB + AVV + Datenschutz. */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n()
  const l = (to: string, label: string) => (
    <Link to={`/legal/${to}`} className="font-semibold underline">
      {label}
    </Link>
  )
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-soft p-3 text-sm leading-relaxed">
      <input id="accept-terms" type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-accent,#f5c400)]" />
      <span>
        {t('termsAccept1')} {l('agb', t('legalTerms'))} {t('termsAnd')} {l('avv', t('legalDpa'))} {t('termsAccept2')} {l('datenschutz', t('legalPrivacy'))}
        {t('termsAccept3')}
      </span>
    </label>
  )
}

/** Shown to existing companies when the terms version changed (or was never accepted). */
export function AcceptTermsPage() {
  const { t, te } = useI18n()
  const { company, setCompany } = useSession()
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function accept() {
    if (!company) return
    setBusy(true)
    setError('')
    try {
      setCompany(await store.saveCompany({ ...company, ...termsStamp() }))
    } catch (e) {
      setError(te(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <TopBar title={t('termsUpdateTitle')} />
      <Page>
        <Card className="space-y-4">
          <p className="text-[15px]">{company?.terms_version ? t('termsUpdated') : t('termsFirst')}</p>
          <TermsCheckbox checked={ok} onChange={setOk} />
          <ErrorText>{error}</ErrorText>
          <Button block disabled={!ok || busy} onClick={accept}>
            {t('termsAgree')}
          </Button>
        </Card>
      </Page>
    </>
  )
}
