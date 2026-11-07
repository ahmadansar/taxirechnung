import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BankConnectionSection } from '../components/BankConnection'
import { TermsCheckbox, termsStamp } from '../components/TermsConsent'
import { JoinWithCode, TeamSection } from '../components/Team'
import { LegalLinks } from './Legal'
import { buildVerfahrensdoku } from '../lib/verfahrensdoku'
import { Button, Card, ErrorText, Field, Input, Page, Section, Segmented, Textarea, Toggle, TopBar } from '../components/ui'
import { downloadBlob } from '../lib/share'
import { downloadFullBackup } from '../lib/backup'
import { exportInvoicesCsv } from '../lib/exportCsv'
import { fmtDate } from '../lib/money'
import { useI18n, type Lang } from '../lib/i18n'
import { useSession } from '../lib/session'
import { store } from '../lib/store'
import type { Company } from '../lib/types'

type Form = Omit<Company, 'id' | 'created_at'>

const empty: Form = {
  name: '',
  owner_name: '',
  street: '',
  zip: '',
  city: '',
  phone: '',
  email: '',
  website: '',
  tax_number: '',
  vat_id: '',
  concession_number: '',
  iban: '',
  bic: '',
  bank_name: '',
  account_holder: '',
  fints_product_id: '',
  small_business: false,
  invoice_prefix: 'RE',
  payment_terms_days: 14,
  default_city: '',
  logo_data_url: '',
  footer_note: '',
}

export default function CompanyPage({ setup }: { setup?: boolean }) {
  const { t, te, lang, setLang } = useI18n()
  const { company, user, setCompany, refresh } = useSession()
  const nav = useNavigate()
  const [f, setF] = useState<Form>(() => {
    if (company) {
      const { id: _i, created_at: _c, ...rest } = company
      void _i
      void _c
      return { ...empty, ...rest }
    }
    return { ...empty, email: user?.email ?? '' }
  })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [terms, setTerms] = useState(false)
  const inviteParam = new URLSearchParams(window.location.search).get('invite') ?? ''
  const [joinMode, setJoinMode] = useState<'new' | 'join'>(inviteParam ? 'join' : 'new')

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    setSaved(false)
  }
  const txt = (k: keyof Form) => ({
    value: String(f[k] ?? ''),
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!f.tax_number.trim() && !f.vat_id.trim()) return setError(t('taxHint'))
    if (setup && !terms) return setError(t('termsRequired'))
    setBusy(true)
    try {
      const c = await store.saveCompany({ ...f, default_city: f.default_city || f.city, id: company?.id, ...(setup ? termsStamp() : {}) })
      setCompany(c)
      setSaved(true)
      if (setup) nav('/')
    } catch (err) {
      setError(te(err))
    } finally {
      setBusy(false)
    }
  }

  function onLogo(file: File | undefined) {
    if (!file) return
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => {
      img.onload = () => {
        // downscale so it stays small in the database and the PDF
        const max = 400
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        set('logo_data_url', canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  async function logout() {
    await store.signOut()
    await refresh()
    nav('/')
  }

  const [backupBusy, setBackupBusy] = useState('')
  async function fullBackup() {
    setBackupBusy('…')
    try {
      await downloadFullBackup((d, n) => setBackupBusy(`${d}/${n}`))
      setCompany({ ...(company as Company), last_backup_at: new Date().toISOString() })
    } catch (e) {
      setError(te(e))
    } finally {
      setBackupBusy('')
    }
  }
  async function csv() {
    const list = await store.listInvoices()
    downloadBlob(exportInvoicesCsv(list), `Rechnungen_${new Date().toISOString().slice(0, 10)}.csv`)
  }
  async function json() {
    const data = store.exportAll ? await store.exportAll() : { company, customers: await store.listCustomers(), invoices: await store.listInvoices() }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `TaxiRechnung_Backup_${new Date().toISOString().slice(0, 10)}.json`)
  }

  const languageSection = (
    <Section title={t('language')}>
      <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
    </Section>
  )
  const accountSection = (
    <Section title={t('account')}>
      <Card className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[15px]">{user?.email}</span>
        <Button type="button" variant="secondary" onClick={logout}>
          {t('logout')}
        </Button>
      </Card>
    </Section>
  )

  // Driver: company data is read-only, no bank / backup / team settings
  if (!setup && company?.role === 'driver') {
    return (
      <>
        <TopBar title={t('navSettings')} />
        <Page>
          <div className="space-y-5">
            <Section title={t('secCompany')}>
              <Card className="space-y-1 text-[15px]">
                <p className="font-semibold">{company.name}</p>
                <p className="text-muted">
                  {company.street}, {company.zip} {company.city}
                </p>
                <p className="pt-2 text-sm text-muted">{t('driverHint')}</p>
              </Card>
            </Section>
            {languageSection}
            {accountSection}
            <LegalLinks />
          </div>
        </Page>
      </>
    )
  }

  return (
    <>
      <TopBar title={setup ? t('companySetupTitle') : t('navSettings')} />
      <Page>
        {setup && store.acceptInvite && (
          <div className="mb-5">
            <Segmented<'new' | 'join'>
              value={joinMode}
              onChange={setJoinMode}
              options={[
                { value: 'new', label: t('setupNewCompany') },
                { value: 'join', label: t('setupJoin') },
              ]}
            />
          </div>
        )}
        {setup && joinMode === 'join' ? (
          <div className="space-y-5">
            <JoinWithCode initial={inviteParam} />
            {accountSection}
          </div>
        ) : (
          <>
        {setup && <p className="mb-5 text-[15px] text-muted">{t('companySetupHint')}</p>}
        <form onSubmit={submit}>
          <Section title={t('secCompany')}>
            <Card className="space-y-4">
              <Field label={t('companyName') + ' *'}>
                <Input required {...txt('name')} placeholder="Taxi Muster" />
              </Field>
              <Field label={t('ownerName') + ' *'}>
                <Input required {...txt('owner_name')} />
              </Field>
              <Field label={t('street') + ' *'}>
                <Input required autoComplete="street-address" {...txt('street')} />
              </Field>
              <div className="grid grid-cols-[7rem_1fr] gap-3">
                <Field label={t('zip') + ' *'}>
                  <Input required inputMode="numeric" autoComplete="postal-code" {...txt('zip')} />
                </Field>
                <Field label={t('city') + ' *'}>
                  <Input required autoComplete="address-level2" {...txt('city')} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('phone')}>
                  <Input type="tel" {...txt('phone')} />
                </Field>
                <Field label={t('email')}>
                  <Input type="email" {...txt('email')} />
                </Field>
              </div>
              <Field label={t('website')}>
                <Input {...txt('website')} />
              </Field>
              <Field label={t('concession')}>
                <Input {...txt('concession_number')} />
              </Field>
              <Field label={t('logo')}>
                <div className="flex items-center gap-3">
                  {f.logo_data_url && <img src={f.logo_data_url} alt="" className="h-12 w-auto rounded border border-line bg-white" />}
                  <input type="file" accept="image/*" onChange={(e) => onLogo(e.target.files?.[0])} className="text-sm" />
                </div>
                {f.logo_data_url && (
                  <button type="button" className="mt-2 text-sm text-danger underline" onClick={() => set('logo_data_url', '')}>
                    {t('removeLogo')}
                  </button>
                )}
              </Field>
            </Card>
          </Section>

          <Section title={t('secTax')}>
            <Card className="space-y-4">
              <p className="text-sm text-muted">{t('taxHint')}</p>
              <Field label={t('taxNumber')}>
                <Input {...txt('tax_number')} placeholder="12/345/67890" />
              </Field>
              <Field label={t('vatId')}>
                <Input {...txt('vat_id')} placeholder="DE123456789" />
              </Field>
              <Toggle checked={f.small_business} onChange={(v) => set('small_business', v)} label={t('smallBusiness')} />
            </Card>
          </Section>

          <Section title={t('secBank')}>
            <Card className="space-y-4">
              <Field label={t('accountHolder')} hint={t('accountHolderHint')}>
                <Input id="account-holder" {...txt('account_holder')} placeholder={f.name} />
              </Field>
              <Field label={t('iban')}>
                <Input {...txt('iban')} autoCapitalize="characters" placeholder="DE00 0000 0000 0000 0000 00" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('bic')}>
                  <Input {...txt('bic')} autoCapitalize="characters" />
                </Field>
                <Field label={t('bankName')}>
                  <Input {...txt('bank_name')} />
                </Field>
              </div>
              {!setup && (
                <Field label={t('fintsProductId')} hint={t('fintsProductIdHint')}>
                  <Input id="fints-product-id" {...txt('fints_product_id')} autoComplete="off" className="font-mono" />
                </Field>
              )}
            </Card>
          </Section>

          <Section title={t('secInvoice')}>
            <Card className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('invoicePrefix')} hint={`${f.invoice_prefix ? f.invoice_prefix + '-' : ''}${new Date().getFullYear()}-0001`}>
                  <Input {...txt('invoice_prefix')} maxLength={8} disabled={!setup && !!company} />
                </Field>
                <Field label={t('paymentTerms')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={f.payment_terms_days}
                    onChange={(e) => set('payment_terms_days', Math.max(0, Number(e.target.value) || 0))}
                  />
                </Field>
              </div>
              <Field label={t('defaultCity')}>
                <Input {...txt('default_city')} placeholder={f.city} />
              </Field>
              <Field label={t('footerNote')}>
                <Textarea {...txt('footer_note')} placeholder="Vielen Dank für Ihre Fahrt!" />
              </Field>
            </Card>
          </Section>

          <div className="space-y-3">
            {setup && <TermsCheckbox checked={terms} onChange={setTerms} />}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" block disabled={busy}>
              {setup ? t('continue') : saved ? '✓ ' + t('saved') : t('save')}
            </Button>
          </div>
        </form>

        <div className="mt-8 space-y-5">
          {!setup && <BankConnectionSection />}
          {!setup && <TeamSection />}
          {languageSection}
          {!setup && (
            <Section title={t('backupTitle')}>
              <Card className="space-y-3">
                <p className="text-sm text-muted">{t('backupHint')}</p>
                <p className="text-sm">
                  {t('backupLast')}: <b>{company?.last_backup_at ? fmtDate(company.last_backup_at) : t('backupNever')}</b>
                </p>
                <Button type="button" block onClick={fullBackup} disabled={!!backupBusy}>
                  {backupBusy ? `${t('loading')} ${backupBusy}` : t('backupNow')}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="secondary" onClick={csv}>
                    CSV
                  </Button>
                  <Button type="button" variant="secondary" onClick={json}>
                    JSON
                  </Button>
                </div>
              </Card>
            </Section>
          )}
          {!setup && company && (
            <Section title={t('gobdTitle')}>
              <Card className="space-y-3">
                <p className="text-sm text-muted">{t('gobdHint')}</p>
                <Button type="button" variant="secondary" block onClick={() => downloadBlob(buildVerfahrensdoku(company), `Verfahrensdokumentation_${company.name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}.pdf`)}>
                  {t('gobdDownload')}
                </Button>
              </Card>
            </Section>
          )}
          {accountSection}
          <LegalLinks />
        </div>
          </>
        )}
      </Page>
    </>
  )
}
