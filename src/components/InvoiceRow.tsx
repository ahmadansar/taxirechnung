import { Link } from 'react-router-dom'
import { fmtDate, fmtEUR, todayISO } from '../lib/money'
import { useI18n } from '../lib/i18n'
import { useSetPaid } from '../lib/queries'
import { paymentState } from '../lib/status'
import type { Invoice } from '../lib/types'
import { Badge, cx } from './ui'

export function useInvoiceStatus() {
  const { t } = useI18n()
  return (inv: Invoice) => {
    if (inv.kind === 'storno') return <Badge tone="muted">{t('storno')}</Badge>
    if (inv.status === 'cancelled') return <Badge tone="danger">{t('cancelled')}</Badge>
    if (inv.paid || inv.payment_method === 'cash' || inv.payment_method === 'card') return <Badge tone="ok">{t('paid')}</Badge>
    if (inv.due_date && inv.due_date < todayISO()) return <Badge tone="danger">{t('overdue')}</Badge>
    return <Badge tone="warn">{t('open')}</Badge>
  }
}

export { isOpen, paymentState } from '../lib/status'

/** Big green / yellow / red status button. Tap toggles paid ↔ open for invoices paid by transfer. */
export function PaidButton({ inv, large }: { inv: Invoice; large?: boolean }) {
  const { t } = useI18n()
  const setPaid = useSetPaid()
  const busy = setPaid.isPending
  const state = paymentState(inv)
  const toggleable =
    inv.kind === 'invoice' && inv.status === 'issued' && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account')

  const label = { paid: '✓ ' + t('paid'), open: t('open'), overdue: '! ' + t('overdue'), storno: t('storno'), cancelled: t('cancelled') }[state]
  const color = {
    paid: 'bg-ok text-white',
    open: 'bg-accent text-accent-ink',
    overdue: 'bg-danger text-white',
    storno: 'bg-soft text-muted',
    cancelled: 'bg-soft text-muted line-through',
  }[state]

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!toggleable || busy) return
    setPaid.mutate({ id: inv.id, paid: !inv.paid })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!toggleable || busy}
      aria-pressed={state === 'paid'}
      title={toggleable ? (inv.paid ? t('markUnpaid') : t('markPaid')) : undefined}
      className={cx(
        'shrink-0 rounded-full font-bold transition active:scale-95 disabled:cursor-default',
        large ? 'min-h-12 w-full px-5 text-[17px]' : 'min-h-9 min-w-[6.5rem] px-3 text-[13px]',
        color,
        busy && 'opacity-60',
      )}
    >
      {label}
    </button>
  )
}

export function InvoiceRow({ inv }: { inv: Invoice }) {
  const { t } = useI18n()
  const who = inv.customer ? inv.customer.company_name || inv.customer.name : t('walkInShort')
  const route = [inv.trip.from, inv.trip.to].filter(Boolean).join(' → ')
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <Link to={`/invoices/${inv.id}`} className="min-w-0 flex-1 active:opacity-60">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold">{who}</span>
          <span className={'shrink-0 text-[15px] font-semibold tabular-nums ' + (inv.status === 'cancelled' ? 'text-muted line-through' : '')}>
            {fmtEUR(inv.totals.gross)}
          </span>
        </div>
        <div className="truncate text-[13px] text-muted">
          {inv.number} · {fmtDate(inv.trip.date)}
          {route && ' · ' + route}
        </div>
      </Link>
      <PaidButton inv={inv} />
    </div>
  )
}
