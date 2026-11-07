import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { shareText } from '../lib/share'
import { store } from '../lib/store'
import type { Member } from '../lib/types'
import { useConfirm } from './Confirm'
import { Badge, Button, Card, ErrorText, Field, Input, Section } from './ui'

const appUrl = () => window.location.origin + window.location.pathname

/** Owner: see the team, invite drivers with a code, remove drivers. */
export function TeamSection() {
  const { t, te } = useI18n()
  const { user } = useSession()
  const { ask, dialog } = useConfirm()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => store.listMembers?.().then(setMembers).catch((e) => setError(te(e)))
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!store.listMembers) {
    return (
      <Section title={t('teamTitle')}>
        <Card>
          <p className="text-sm text-muted">{t('teamDemoHint')}</p>
        </Card>
      </Section>
    )
  }

  async function invite() {
    setBusy(true)
    setError('')
    try {
      setCode(await store.createInvite!())
    } catch (e) {
      setError(te(e))
    } finally {
      setBusy(false)
    }
  }
  async function remove(m: Member) {
    if (!(await ask(`${m.email}: ${t('teamRemoveConfirm')}`, t('teamRemove')))) return
    try {
      await store.removeMember!(m.user_id)
      reload()
    } catch (e) {
      setError(te(e))
    }
  }
  const pretty = code ? `${code.slice(0, 4)}-${code.slice(4)}` : ''
  const message = `${t('teamInviteMsg')}\n${appUrl()}?invite=${code}\n${t('inviteCode')}: ${pretty}`

  return (
    <Section title={t('teamTitle')}>
      <Card className="space-y-3">
        <p className="text-sm text-muted">{t('teamHint')}</p>
        {members?.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-[15px]">
                {m.email || '—'} {m.user_id === user?.id && <span className="text-muted">({t('you')})</span>}
              </div>
              <Badge tone={m.role === 'owner' ? 'ok' : 'muted'}>{m.role === 'owner' ? t('roleOwner') : t('roleDriver')}</Badge>
            </div>
            {m.role === 'driver' && (
              <button type="button" onClick={() => remove(m)} className="shrink-0 text-sm text-danger underline">
                {t('teamRemove')}
              </button>
            )}
          </div>
        ))}
        {code ? (
          <div className="space-y-2 rounded-xl bg-soft p-3">
            <p className="text-sm">{t('inviteCodeHint')}</p>
            <p id="invite-code" className="text-center font-mono text-2xl font-bold tracking-widest">
              {pretty}
            </p>
            <Button type="button" block onClick={() => shareText(message)}>
              {t('inviteShare')}
            </Button>
          </div>
        ) : (
          <Button type="button" block variant="secondary" disabled={busy} onClick={invite}>
            + {t('inviteDriver')}
          </Button>
        )}
        <ErrorText>{error}</ErrorText>
      </Card>
      {dialog}
    </Section>
  )
}

/** Setup screen for a driver: join an existing company with the owner's code. */
export function JoinWithCode({ initial = '' }: { initial?: string }) {
  const { t, te } = useI18n()
  const { refresh } = useSession()
  const [code, setCode] = useState(initial)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function join() {
    setBusy(true)
    setError('')
    try {
      await store.acceptInvite!(code)
      await refresh()
    } catch (e) {
      setError(te(e))
      setBusy(false)
    }
  }
  return (
    <Card className="space-y-4">
      <p className="text-sm text-muted">{t('joinHint')}</p>
      <Field label={t('inviteCode')}>
        <Input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD-EFGH"
          autoCapitalize="characters"
          autoComplete="off"
          className="text-center font-mono text-xl tracking-widest"
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="button" block disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 8} onClick={join}>
        {t('joinCompany')}
      </Button>
    </Card>
  )
}
