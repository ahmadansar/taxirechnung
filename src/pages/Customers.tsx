import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconPlus } from '../components/icons'
import { Badge, Card, Empty, Page, SearchInput, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useCustomers } from '../lib/queries'
import type { Customer } from '../lib/types'

export function matchCustomer(c: Customer, q: string) {
  if (!q) return true
  const hay = [c.customer_number, c.company_name, c.name, c.street, c.zip, c.city, c.email, c.phone, c.reference, c.notes]
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w) || hay.replace(/\s/g, '').includes(w))
}

export default function Customers() {
  const { t } = useI18n()
  const list = useCustomers().data ?? null
  const [q, setQ] = useState('')

  const filtered = useMemo(() => (list ?? []).filter((c) => matchCustomer(c, q)), [list, q])

  return (
    <>
      <TopBar
        title={t('customers')}
        right={
          <Link to="/customers/new" aria-label={t('newCustomer')} className="flex h-10 items-center gap-1 rounded-full bg-accent px-3 text-sm font-semibold text-accent-ink">
            <IconPlus /> <span className="hidden sm:inline">{t('newCustomer')}</span>
          </Link>
        }
      />
      <Page>
        <div className="mb-4">
          <SearchInput placeholder={t('searchCustomers')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list === null ? (
          <Empty>{t('loading')}</Empty>
        ) : list.length === 0 ? (
          <Empty>{t('noCustomers')}</Empty>
        ) : filtered.length === 0 ? (
          <Empty>{t('noResults')}</Empty>
        ) : (
          <Card className="p-0">
            {filtered.map((c) => (
              <Link key={c.id} to={`/customers/${c.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 active:bg-soft">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-soft text-sm font-bold">
                  {(c.company_name || c.name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{c.company_name || c.name}</span>
                    {c.type === 'business' && <Badge tone="muted">{t('businessCustomer')}</Badge>}
                  </div>
                  <div className="truncate text-[13px] text-muted">
                    {[c.company_name && c.name, [c.zip, c.city].filter(Boolean).join(' '), c.phone].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="text-xs text-muted">{c.customer_number}</span>
              </Link>
            ))}
          </Card>
        )}
      </Page>
    </>
  )
}
