import type { ReactNode } from 'react'
import { HashRouter, MemoryRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { IconDoc, IconGear, IconHome, IconPlus, IconUsers } from './components/icons'
import { cx } from './components/ui'
import { useI18n } from './lib/i18n'
import { useSession } from './lib/session'
import { store } from './lib/store'
import AuthPage from './pages/Auth'
import BankImport from './pages/BankImport'
import CompanyPage from './pages/Company'
import CustomerDetail from './pages/CustomerDetail'
import CustomerEdit from './pages/CustomerEdit'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import InvoiceDetail from './pages/InvoiceDetail'
import InvoiceNew from './pages/InvoiceNew'
import Invoices from './pages/Invoices'
import PayPage from './pages/PayPage'
import ReminderPage from './pages/Reminder'
import LegalPage from './pages/Legal'
import { AcceptTermsPage } from './components/TermsConsent'
import { TERMS_VERSION } from './legal/operator'
import { useLiveSync } from './lib/queries'

function BottomNav() {
  const { t } = useI18n()
  const loc = useLocation()
  if (loc.pathname.startsWith('/invoices/new') || loc.pathname.startsWith('/pay/') || loc.pathname.endsWith('/reminder')) return null
  const item = (to: string, label: string, icon: ReactNode) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-ink' : 'text-muted')
      }
    >
      {icon}
      {label}
    </NavLink>
  )
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-end px-2">
        {item('/', t('navHome'), <IconHome />)}
        {item('/customers', t('navCustomers'), <IconUsers />)}
        <NavLink
          to="/invoices/new"
          aria-label={t('newInvoice')}
          className="-mt-6 mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-lg ring-4 ring-bg"
        >
          <IconPlus />
        </NavLink>
        {item('/invoices', t('navInvoices'), <IconDoc />)}
        {item('/settings', t('navSettings'), <IconGear />)}
      </div>
    </nav>
  )
}

/** In-app preview of the customer's pay page (same view the customer gets from the link). */
function PayPreview() {
  const { token } = useParams()
  const nav = useNavigate()
  return (
    <div>
      <button onClick={() => nav(-1)} className="pt-safe px-4 py-3 text-2xl" aria-label="back">
        ‹
      </button>
      <PayPage token={token ?? ''} />
    </div>
  )
}

function DemoBanner() {
  const { t } = useI18n()
  if (store.mode !== 'demo') return null
  return <div className="bg-accent px-4 py-1 text-center text-xs font-semibold text-accent-ink">{t('demoBadge')}</div>
}

/** Legal pages are reachable in every state (logged out, during setup, logged in). */
function Gate() {
  return (
    <Routes>
      <Route path="/legal/:doc" element={<LegalPage />} />
      <Route path="*" element={<Main />} />
    </Routes>
  )
}

function Main() {
  const { ready, user, company } = useSession()
  useLiveSync(!!company)
  const { t } = useI18n()
  if (!ready) return <div className="p-10 text-center text-muted">{t('loading')}</div>
  if (!user)
    return (
      <Routes>
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<AuthPage mode="login" />} />
      </Routes>
    )
  if (!company) return <CompanyPage setup />
  // terms_version is undefined only while the database update (schema.sql) has not been run yet
  if (company.role !== 'driver' && company.terms_version !== undefined && company.terms_version !== TERMS_VERSION) return <AcceptTermsPage />
  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<CustomerEdit />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/customers/:id/edit" element={<CustomerEdit />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/new" element={<InvoiceNew />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/reminder" element={<ReminderPage />} />
        <Route path="/settings" element={<CompanyPage />} />
        <Route path="/bank" element={company.role === 'driver' ? <Navigate to="/" replace /> : <BankImport />} />
        <Route path="/pay/:token" element={<PayPreview />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  )
}

declare const __DEMO_BUILD__: boolean
// Hosted demo runs inside an embedded frame → keep routing in memory there.
const Router = __DEMO_BUILD__ ? MemoryRouter : HashRouter

// Customer payment link: …/?pay=<token> (public, no login)
const payToken = new URLSearchParams(window.location.search).get('pay')

export default function App() {
  if (payToken) return <PayPage token={payToken} />
  return (
    <Router>
      <DemoBanner />
      <Gate />
    </Router>
  )
}
