import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CustomerFields, emptyCustomer, type CustomerForm } from '../components/CustomerFields'
import { IconTrash, IconX } from '../components/icons'
import { Button, Card, ErrorText, Field, Input, Page, SearchInput, Section, Segmented, Select, Textarea, Toggle, TopBar, cx } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { addDays, calcTotals, centsToInput, fmtEUR, grossToNet, isSmallInvoice, netToGross, parseEUR, suggestTaxiRate, todayISO } from '../lib/money'
import { useSession } from '../lib/session'
import { store } from '../lib/store'
import { keys, queryClient } from '../lib/queries'
import type { Customer, InvoiceItem, PartySnapshot, PaymentMethod, Trip, VatRate } from '../lib/types'
import { matchCustomer } from './Customers'

type RecipientMode = 'customer' | 'walkin' | 'onetime'
interface ItemForm {
  description: string
  quantity: string
  price: string
  vat_rate: VatRate
}

type PriceMode = 'gross' | 'net'
const PRICE_MODE_KEY = 'taxirechnung.priceMode'
const loadPriceMode = (): PriceMode => {
  try {
    return localStorage.getItem(PRICE_MODE_KEY) === 'net' ? 'net' : 'gross'
  } catch {
    return 'gross'
  }
}

const nowTime = () => new Date().toTimeString().slice(0, 5)
const newItem = (description: string, rate: VatRate): ItemForm => ({ description, quantity: '1', price: '', vat_rate: rate })

const snapshot = (c: CustomerForm | Customer): PartySnapshot => ({
  company_name: c.type === 'business' ? c.company_name.trim() : '',
  name: c.name.trim(),
  street: c.street.trim(),
  zip: c.zip.trim(),
  city: c.city.trim(),
  email: c.email.trim(),
  vat_id: c.type === 'business' ? c.vat_id.trim() : '',
})

export default function InvoiceNew() {
  const { t, te } = useI18n()
  const { company } = useSession()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const small = company?.small_business ?? false

  const [customers, setCustomers] = useState<Customer[]>([])
  const [mode, setMode] = useState<RecipientMode>('walkin')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [picking, setPicking] = useState(false)
  const [q, setQ] = useState('')
  const [oneTime, setOneTime] = useState<CustomerForm>(emptyCustomer)
  const [saveAsCustomer, setSaveAsCustomer] = useState(true)

  const [trip, setTrip] = useState<Trip>({
    date: todayISO(),
    time: nowTime(),
    from: '',
    to: '',
    km: null,
    within_municipality: false,
    vehicle_plate: '',
    driver: '',
    passengers: null,
  })
  const [kmText, setKmText] = useState('')
  const [vatAuto, setVatAuto] = useState(true)
  const [items, setItems] = useState<ItemForm[]>([newItem('Taxifahrt', 7)])
  // Amount typed incl. VAT (taximeter price) or excl. VAT (VAT is added on top) – remembered on this phone
  const [priceModeState, setPriceModeState] = useState<PriceMode>(loadPriceMode)
  const priceMode: PriceMode = small ? 'gross' : priceModeState
  const setPriceMode = (m: PriceMode) => {
    setPriceModeState(m)
    try {
      localStorage.setItem(PRICE_MODE_KEY, m)
    } catch {
      /* private mode */
    }
  }
  const [payment, setPayment] = useState<PaymentMethod>('cash')
  const [paid, setPaid] = useState(false)
  const [issueDate, setIssueDate] = useState(todayISO())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [templateNo, setTemplateNo] = useState('')

  // ── prefill from ?customer= or ?from= (repeat invoice) ──
  useEffect(() => {
    store.listCustomers().then(async (list) => {
      setCustomers(list)
      const cid = params.get('customer')
      const fromId = params.get('from')
      if (cid) {
        const c = list.find((x) => x.id === cid)
        if (c) pickCustomer(c)
      }
      if (fromId) {
        const src = await store.getInvoice(fromId)
        if (!src) return
        setTemplateNo(src.number)
        const c = src.customer_id ? list.find((x) => x.id === src.customer_id) : null
        if (c) pickCustomer(c)
        else if (src.customer) {
          setMode('onetime')
          setOneTime({ ...emptyCustomer, ...src.customer, type: src.customer.company_name ? 'business' : 'private' })
          setSaveAsCustomer(false)
        } else setMode('walkin')
        setTrip((tr) => ({ ...src.trip, date: tr.date, time: tr.time }))
        setKmText(src.trip.km != null ? String(src.trip.km).replace('.', ',') : '')
        setItems(
          src.items
            .filter((it) => it.quantity > 0)
            .map((it) => ({ description: it.description, quantity: String(it.quantity).replace('.', ','), price: centsToInput(priceMode === 'net' ? grossToNet(it.unit_price_gross, it.vat_rate) : it.unit_price_gross), vat_rate: it.vat_rate })),
        )
        setVatAuto(false)
        setPayment(src.payment_method)
        setReference(src.reference)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickCustomer(c: Customer) {
    setCustomer(c)
    setMode('customer')
    setPicking(false)
    setQ('')
    setReference(c.reference || '')
    if (c.type === 'business') setPayment('on_account')
  }

  // ── VAT suggestion (7 % / 19 %) ──
  const suggested = suggestTaxiRate(trip.km, trip.within_municipality)
  useEffect(() => {
    if (vatAuto) setItems((its) => its.map((it) => ({ ...it, vat_rate: suggested })))
  }, [suggested, vatAuto])

  const parsedItems: InvoiceItem[] = useMemo(
    () =>
      items.map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity.replace(',', '.')) || 0,
        unit_price_gross: priceMode === 'net' ? netToGross(parseEUR(it.price), it.vat_rate) : parseEUR(it.price),
        vat_rate: small ? 0 : it.vat_rate,
      })),
    [items, small, priceMode],
  )
  const totals = calcTotals(parsedItems, small)

  const setItem = (i: number, patch: Partial<ItemForm>) => setItems((its) => its.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const filteredCustomers = customers.filter((c) => matchCustomer(c, q)).slice(0, 8)
  const needsInvoiceData = payment === 'transfer' || payment === 'on_account'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const valid = parsedItems.filter((it) => it.unit_price_gross !== 0 && it.quantity !== 0)
    if (!valid.length) return setError(t('needItems'))
    if (!company?.tax_number && !company?.vat_id) return setError(t('needCompanyTax'))

    let party: PartySnapshot | null = null
    if (mode === 'customer' && customer) party = snapshot(customer)
    if (mode === 'onetime') party = snapshot(oneTime)
    const hasAddress = !!party && !!(party.company_name || party.name) && !!party.street && !!party.zip && !!party.city
    if (!isSmallInvoice(totals.gross) && !hasAddress) return setError(t('needRecipient'))

    setBusy(true)
    try {
      let customerId = mode === 'customer' ? (customer?.id ?? null) : null
      if (mode === 'onetime' && saveAsCustomer && (oneTime.name || oneTime.company_name)) {
        const saved = await store.saveCustomer(oneTime)
        customerId = saved.id
      }
      const isPaid = payment === 'cash' || payment === 'card' || paid
      const inv = await store.createInvoice({
        customer_id: customerId,
        kind: 'invoice',
        storno_of: null,
        storno_of_number: null,
        issue_date: issueDate,
        due_date: needsInvoiceData && !paid ? addDays(issueDate, company?.payment_terms_days ?? 14) : null,
        customer: party,
        trip: { ...trip, from: trip.from.trim(), to: trip.to.trim(), vehicle_plate: trip.vehicle_plate.trim().toUpperCase(), driver: trip.driver.trim() },
        items: valid,
        payment_method: payment,
        paid: isPaid,
        paid_at: isPaid ? trip.date : null,
        reference: reference.trim(),
        notes: notes.trim(),
      })
      queryClient.invalidateQueries({ queryKey: keys.invoices })
      if (customerId && mode === 'onetime') queryClient.invalidateQueries({ queryKey: keys.customers })
      nav(`/invoices/${inv.id}?new=1`, { replace: true })
    } catch (err) {
      setError(te(err))
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title={t('newInvoice')} back right={<button onClick={() => nav(-1)} aria-label={t('cancel')} className="p-2"><IconX /></button>} />
      <Page>
        {templateNo && (
          <p className="mb-4 rounded-xl bg-soft px-3 py-2 text-sm">
            ↻ {t('repeatFrom')} <b>{templateNo}</b>
          </p>
        )}
        <form onSubmit={submit} id="inv-form">
          {/* ── Recipient ── */}
          <Section title={t('recipient')}>
            <Card className="space-y-3">
              <Segmented<RecipientMode>
                value={mode}
                onChange={(m) => {
                  setMode(m)
                  if (m === 'customer' && !customer) setPicking(true)
                }}
                options={[
                  { value: 'customer', label: t('segCustomer') },
                  { value: 'onetime', label: t('segOneTime') },
                  { value: 'walkin', label: t('walkInShort') },
                ]}
              />
              {mode === 'walkin' && <p className="text-sm text-muted">{t('walkInHint')}</p>}

              {mode === 'customer' && customer && !picking && (
                <div className="flex items-start justify-between gap-3 rounded-xl bg-soft p-3">
                  <div className="min-w-0 text-[15px]">
                    <div className="font-semibold">{customer.company_name || customer.name}</div>
                    <div className="text-sm text-muted">
                      {[customer.company_name && customer.name, customer.street, [customer.zip, customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <button type="button" className="shrink-0 text-sm font-semibold underline" onClick={() => setPicking(true)}>
                    {t('change')}
                  </button>
                </div>
              )}

              {mode === 'customer' && (picking || !customer) && (
                <div className="space-y-2">
                  <SearchInput autoFocus placeholder={t('searchCustomers')} value={q} onChange={(e) => setQ(e.target.value)} />
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
                    {filteredCustomers.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => pickCustomer(c)}
                        className="block w-full border-b border-line px-3 py-2.5 text-left last:border-b-0 active:bg-soft"
                      >
                        <div className="text-[15px] font-medium">{c.company_name || c.name}</div>
                        <div className="text-[13px] text-muted">{[c.company_name && c.name, c.city, c.phone].filter(Boolean).join(' · ')}</div>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && <p className="px-3 py-3 text-sm text-muted">{t('noResults')}</p>}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('onetime')
                        setSaveAsCustomer(true)
                        setOneTime({ ...emptyCustomer, name: q })
                        setPicking(false)
                      }}
                      className="block w-full px-3 py-3 text-left text-[15px] font-semibold"
                    >
                      + {t('newCustomer')}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'onetime' && (
                <>
                  <CustomerFields value={oneTime} onChange={setOneTime} compact />
                  <Toggle checked={saveAsCustomer} onChange={setSaveAsCustomer} label={t('saveAsCustomer')} />
                </>
              )}
            </Card>
          </Section>

          {/* ── Trip ── */}
          <Section title={t('trip')}>
            <Card className="space-y-4">
              <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                <Field label={t('serviceDate')}>
                  <Input type="date" required value={trip.date} onChange={(e) => setTrip({ ...trip, date: e.target.value })} />
                </Field>
                <Field label={t('time')}>
                  <Input type="time" value={trip.time} onChange={(e) => setTrip({ ...trip, time: e.target.value })} />
                </Field>
              </div>
              <Field label={t('from')}>
                <Input value={trip.from} onChange={(e) => setTrip({ ...trip, from: e.target.value })} placeholder="Bahnhof Esslingen" />
              </Field>
              <Field label={t('to')}>
                <Input value={trip.to} onChange={(e) => setTrip({ ...trip, to: e.target.value })} placeholder="Flughafen Stuttgart" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('km')}>
                  <Input
                    inputMode="decimal"
                    value={kmText}
                    onChange={(e) => {
                      setKmText(e.target.value)
                      const n = parseFloat(e.target.value.replace(',', '.'))
                      setTrip({ ...trip, km: Number.isFinite(n) ? n : null })
                    }}
                  />
                </Field>
                <Field label={t('passengers')}>
                  <Input
                    inputMode="numeric"
                    value={trip.passengers ?? ''}
                    onChange={(e) => setTrip({ ...trip, passengers: e.target.value ? Number(e.target.value) || null : null })}
                  />
                </Field>
              </div>
              {!small && (
                <>
                  <Toggle checked={trip.within_municipality} onChange={(v) => setTrip({ ...trip, within_municipality: v })} label={t('withinMunicipality')} />
                  <p className={cx('rounded-lg px-3 py-2 text-sm', suggested === 7 ? 'bg-ok/10 text-ok' : 'bg-accent/20 text-ink')}>
                    {suggested === 7 ? t('vatHint7') : t('vatHint19')}
                  </p>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('vehicle')}>
                  <Input value={trip.vehicle_plate} autoCapitalize="characters" onChange={(e) => setTrip({ ...trip, vehicle_plate: e.target.value })} placeholder="ES-TX 123" />
                </Field>
                <Field label={t('driver')}>
                  <Input value={trip.driver} onChange={(e) => setTrip({ ...trip, driver: e.target.value })} />
                </Field>
              </div>
            </Card>
          </Section>

          {/* ── Items ── */}
          <Section title={t('positions')}>
            <div className="space-y-3">
              {!small && (
                <div className="space-y-2">
                  <Segmented<PriceMode>
                    value={priceMode}
                    onChange={setPriceMode}
                    options={[
                      { value: 'gross', label: t('priceModeGross') },
                      { value: 'net', label: t('priceModeNet') },
                    ]}
                  />
                  {priceMode === 'net' && <p className="px-1 text-xs text-muted">{t('priceModeNetHint')}</p>}
                </div>
              )}
              {items.map((it, i) => (
                <Card key={i} className="space-y-3">
                  <div className="flex items-end gap-2">
                    <Field label={t('description')} className="flex-1">
                      <Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                    </Field>
                    {items.length > 1 && (
                      <button type="button" aria-label={t('delete')} onClick={() => setItems(items.filter((_, j) => j !== i))} className="flex h-12 w-12 items-center justify-center text-muted">
                        <IconTrash />
                      </button>
                    )}
                  </div>
                  <div className={cx('grid gap-3', small ? 'grid-cols-[5rem_1fr]' : 'grid-cols-[4.5rem_1fr_5.5rem]')}>
                    <Field label={t('qty')}>
                      <Input inputMode="decimal" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
                    </Field>
                    <Field label={priceMode === 'net' ? t('priceNet') : t('priceGross')}>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={it.price}
                        autoFocus={i === 0 && items.length === 1 && !templateNo}
                        onChange={(e) => setItem(i, { price: e.target.value })}
                        onBlur={(e) => e.target.value && setItem(i, { price: centsToInput(parseEUR(e.target.value)) })}
                        className="text-right text-lg font-semibold"
                      />
                    </Field>
                    {!small && (
                      <Field label={t('vat')}>
                        <Select
                          value={it.vat_rate}
                          onChange={(e) => {
                            setVatAuto(false)
                            setItem(i, { vat_rate: Number(e.target.value) as VatRate })
                          }}
                        >
                          <option value={7}>7 %</option>
                          <option value={19}>19 %</option>
                          <option value={0}>0 %</option>
                        </Select>
                      </Field>
                    )}
                  </div>
                  {priceMode === 'net' && parsedItems[i]?.unit_price_gross > 0 && (
                    <p className="text-right text-sm text-muted" data-testid="net-breakdown">
                      {fmtEUR(Math.round(parsedItems[i].quantity * parseEUR(it.price)))} + {it.vat_rate} % {t('vat')} ={' '}
                      <b className="text-ink">{fmtEUR(Math.round(parsedItems[i].quantity * parsedItems[i].unit_price_gross))}</b>
                    </p>
                  )}
                </Card>
              ))}
              <div className="flex flex-wrap gap-2">
                {[
                  ['Taxifahrt', t('quickTaxi')],
                  ['Wartezeit', t('quickWait')],
                  ['Gepäckzuschlag', t('quickLuggage')],
                  ['Zuschlag', t('quickExtra')],
                ].map(([desc, label]) => (
                  <button
                    type="button"
                    key={desc}
                    onClick={() => setItems([...items, newItem(desc, items[items.length - 1]?.vat_rate ?? suggested)])}
                    className="min-h-10 rounded-full border border-line bg-card px-3 text-sm font-medium"
                  >
                    + {label}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Payment ── */}
          <Section title={t('payment')}>
            <Card className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(['cash', 'card', 'transfer', 'on_account'] as PaymentMethod[]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => setPayment(p)}
                    className={cx('min-h-12 rounded-xl border text-[15px] font-medium', payment === p ? 'border-ink bg-ink text-bg' : 'border-line bg-card')}
                  >
                    {t(`pm_${p}`)}
                  </button>
                ))}
              </div>
              {needsInvoiceData && <Toggle checked={paid} onChange={setPaid} label={t('paidAlready')} />}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('issueDate')}>
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </Field>
                <Field label={t('reference')}>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
              </div>
              <Field label={t('invoiceNotes')}>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </Card>
          </Section>
        </form>
      </Page>

      {/* ── Sticky total + submit ── */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 pt-3">
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-3 pt-1">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">
                {t('totalGross')}
                {!small && totals.lines.length > 0 && ` · ${t('net')} ${fmtEUR(totals.net)}`}
              </div>
              <div className="text-2xl font-bold tabular-nums">{fmtEUR(totals.gross)}</div>
            </div>
            <Button type="submit" form="inv-form" disabled={busy} className="px-6">
              {t('createInvoice')}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
