import { useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

/** In-app confirmation sheet (native confirm() is blocked in some embedded views). */
export function useConfirm() {
  const { t } = useI18n()
  const [msg, setMsg] = useState<{ text: string; ok: string } | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})

  const ask = (text: string, ok: string) =>
    new Promise<boolean>((res) => {
      resolver.current = res
      setMsg({ text, ok })
    })
  const close = (v: boolean) => {
    setMsg(null)
    resolver.current(v)
  }

  const dialog = msg && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => close(false)}>
      <div role="alertdialog" aria-modal="true" className="pb-safe w-full max-w-md rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <p className="mb-5 text-[16px] leading-relaxed">{msg.text}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={() => close(true)} autoFocus>
            {msg.ok}
          </Button>
        </div>
      </div>
    </div>
  )
  return { ask, dialog }
}
