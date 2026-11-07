import { Link, useParams } from 'react-router-dom'
import { InvoiceRow } from '../components/InvoiceRow'
import { IconMail, IconPhone, IconPlus } from '../components/icons'
import { Card, Empty, Page, Section, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { fmtEUR } from '../lib/money'
import { useCustomer, useInvoices } from '../lib/queries'
import type { Customer } from '../lib/types'

export default function CustomerDetail() {
  const { id } = useParams()
  const { t } = useI18n()
  const cq = useCustomer(id)
  const c: Customer | null | undefined = cq.data !== undefined ? cq.data : cq.isError ? null : undefined
  const inv = (useInvoices().data ?? []).filter((i) => i.customer_id === id)

  if (c === undefined) return <Empty>{t('loading')}</Empty>
  if (c === null) return <Empty>{t('noResults')}</Empty>

  const total = inv.reduce((s, i) => s + i.totals.gross, 0)
  const last = inv[0]

  return (
    <>
      <TopBar
        title={c.company_name || c.name}
        back="/customers"
        right={
          <Link to={`/customers/${c.id}/edit`} className="text-sm font-semibold underline">
            {t('edit')}
          </Link>
        }
      />
      <Page>
        <Card className="mb-4">
          <div className="text-xs text-muted">
            {t('customerNo')} {c.customer_number}
          </div>
          {c.company_name && c.name && <div className="mt-1 text-[15px]">{c.name}</div>}
          <div className="mt-1 text-[15px] text-muted">
            {c.street && <div>{c.street}</div>}
            {(c.zip || c.city) && <div>{[c.zip, c.city].filter(Boolean).join(' ')}</div>}
            {c.vat_id && <div>USt-IdNr. {c.vat_id}</div>}
            {c.reference && <div>Ref. {c.reference}</div>}
          </div>
          {c.notes && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-soft p-2 text-sm">{c.notes}</p>}
          <div className="mt-3 flex gap-2">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium">
                <IconPhone /> {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-line px-2 text-sm font-medium">
                <IconMail /> <span className="truncate">{c.email}</span>
              </a>
            )}
          </div>
        </Card>

        <div className="mb-6 grid grid-cols-1 gap-2">
          <Link to={`/invoices/new?customer=${c.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-ink">
            <IconPlus /> {t('invoiceForCustomer')}
          </Link>
          {last && (
            <Link to={`/invoices/new?from=${last.id}`} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-semibold">
              ↻ {t('repeat')}: {[last.trip.from, last.trip.to].filter(Boolean).join(' → ') || last.number} · {fmtEUR(last.totals.gross)}
            </Link>
          )}
        </div>

        <Section title={t('customerInvoices')} right={<span className="text-sm font-semibold tabular-nums">{fmtEUR(total)}</span>}>
          {inv.length === 0 ? (
            <Empty>{t('noInvoices')}</Empty>
          ) : (
            <Card className="p-0">
              {inv.map((i) => (
                <InvoiceRow key={i.id} inv={i} />
              ))}
            </Card>
          )}
        </Section>
      </Page>
    </>
  )
}
