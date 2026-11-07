import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconCar } from '../components/icons'
import { Button, ErrorText, Field, Input, Segmented } from '../components/ui'
import { LegalLinks } from './Legal'
import { useI18n, type Lang } from '../lib/i18n'
import { useSession } from '../lib/session'
import { seedDemo } from '../lib/seed'
import { store } from '../lib/store'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t, te, lang, setLang } = useI18n()
  const { refresh } = useSession()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'register') {
        const r = await store.signUp(email, password)
        if (r.needsConfirmation) {
          setInfo(t('confirmEmail'))
          nav('/login')
          return
        }
      } else {
        await store.signIn(email, password)
      }
      await refresh()
      nav('/')
    } catch (err) {
      setError(te(err))
    } finally {
      setBusy(false)
    }
  }

  async function tryDemo() {
    setBusy(true)
    try {
      await seedDemo()
      await refresh()
      nav('/')
    } catch (err) {
      setError(te(err))
      setBusy(false)
    }
  }

  async function forgot() {
    setError('')
    if (!email) return setError(t('email') + ': ' + t('required'))
    try {
      await store.resetPassword(email)
      setInfo(t('resetSent'))
    } catch (err) {
      setError(te(err))
    }
  }

  return (
    <div className="pt-safe mx-auto flex min-h-[90vh] max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-ink">
            <IconCar />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">{t('appName')}</span>
        </div>
        <div className="w-28">
          <Segmented<Lang> value={lang} onChange={setLang} options={[{ value: 'de', label: 'DE' }, { value: 'en', label: 'EN' }]} />
        </div>
      </div>
      <p className="mb-8 text-[15px] leading-relaxed text-muted">{t('tagline')}</p>

      <form onSubmit={submit} className="space-y-4">
        <Field label={t('email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('password')} hint={mode === 'register' ? t('passwordMin') : undefined}>
          <Input
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
            minLength={mode === 'register' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        {info && <p className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}
        <Button type="submit" block disabled={busy}>
          {mode === 'login' ? t('login') : t('register')}
        </Button>
      </form>

      {store.mode === 'demo' && mode === 'login' && (
        <Button type="button" variant="secondary" block className="mt-3" disabled={busy} onClick={tryDemo}>
          {t('tryDemo')}
        </Button>
      )}

      <div className="mt-6 space-y-3 text-center text-[15px]">
        {mode === 'login' ? (
          <>
            {store.mode === 'cloud' && (
              <button type="button" onClick={forgot} className="text-muted underline">
                {t('forgot')}
              </button>
            )}
            <p>
              {t('noAccount')}{' '}
              <Link to="/register" className="font-semibold underline">
                {t('register')}
              </Link>
            </p>
          </>
        ) : (
          <p>
            {t('haveAccount')}{' '}
            <Link to="/login" className="font-semibold underline">
              {t('login')}
            </Link>
          </p>
        )}
      </div>
      <LegalLinks className="mt-10" />
    </div>
  )
}
