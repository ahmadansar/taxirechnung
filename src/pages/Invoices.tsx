import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { InvoiceRow, isOpen } from '../components/InvoiceRow'
import { Card, Empty, Page, SearchInput, Segmented, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useIsOwner } from '../lib/session'
import { fmtEUR } from '../lib/money'
import type { Invoice } from '../lib/types'
import { useInvoices } from '../lib/queries'

type Filter = 'all' | 'open' | 'paid'

function matches(i: Invoice, q: string) {
  if (!q) return true
  const c = i.customer
  const hay = [i.number, c?.company_name, c?.name, c?.city, c?.email, i.trip.from, i.trip.to, i.trip.date.split('-').reverse().join('.'), i.reference, i.trip.vehicle_plate, i.trip.driver]
    .join(' ')
    .toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}

const monthLabel = (ym: string, lang: string) =>
  new Date(ym + '-15').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'long', year: 'numeric' })

export default function Invoices() {
  const { t, lang } = useI18n()
  const isOwner = useIsOwner()
  const [params, setParams] = useSearchParams()
  const list = useInvoices().data ?? null
  const [q, setQ] = useState('')
  const filter = (params.get('filter') as Filter) || 'all'


  const groups = useMemo(() => {
    const f = (list ?? [])
      .filter((i) => matches(i, q))
      .filter((i) => (filter === 'open' ? isOpen(i) : filter === 'paid' ? !isOpen(i) && i.kind === 'invoice' && i.status === 'issued' : true))
    const m = new Map<string, Invoice[]>()
    f.forEach((i) => {
      const k = i.issue_date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), i])
    })
    return [...m.entries()]
  }, [list, q, filter])

  return (
    <>
      <TopBar
        title={t('invoices')}
        right={
          isOwner && <Link to="/bank" className="flex h-10 items-center gap-1 rounded-full border border-line bg-card px-3 text-sm font-semibold">
            🏦 {t('bankImportShort')}
          </Link>
        }
      />
      <Page>
        <div className="mb-3">
          <SearchInput placeholder={t('searchInvoices')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="mb-4">
          <Segmented<Filter>
            value={filter}
            onChange={(v) => setParams(v === 'all' ? {} : { filter: v }, { replace: true })}
            options={[
              { value: 'all', label: t('all') },
              { value: 'open', label: t('filterOpen') },
              { value: 'paid', label: t('filterPaid') },
            ]}
          />
        </div>
        {list === null ? (
          <Empty>{t('loading')}</Empty>
        ) : groups.length === 0 ? (
          <Empty>{list.length ? t('noResults') : t('noInvoices')}</Empty>
        ) : (
          groups.map(([ym, items]) => (
            <section key={ym} className="mb-5">
              <div className="mb-2 flex justify-between px-1 text-[13px] font-semibold text-muted">
                <span className="capitalize">{monthLabel(ym, lang)}</span>
                <span className="tabular-nums">
                  {fmtEUR(items.reduce((s, i) => s + i.totals.gross, 0))}
                </span>
              </div>
              <Card className="p-0">
                {items.map((i) => (
                  <InvoiceRow key={i.id} inv={i} />
                ))}
              </Card>
            </section>
          ))
        )}
      </Page>
    </>
  )
}
