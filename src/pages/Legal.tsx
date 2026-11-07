import { Link, useParams } from 'react-router-dom'
import { Card, Page, TopBar } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { operatorComplete } from '../legal/operator'
import { LEGAL_DOCS, LEGAL_TITLES, fillParts, type LegalDoc } from '../legal/texts'

const ORDER: LegalDoc[] = ['impressum', 'datenschutz', 'agb', 'avv']

function Text({ s }: { s: string }) {
  return (
    <>
      {fillParts(s).map((p, i) =>
        p.missing ? (
          <mark key={i} className="rounded bg-danger/15 px-1 text-danger">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

/** Small link row for footers (login page, settings). */
export function LegalLinks({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const label: Record<LegalDoc, string> = { impressum: t('legalImprint'), datenschutz: t('legalPrivacy'), agb: t('legalTerms'), avv: t('legalDpa') }
  return (
    <nav className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted ${className}`}>
      {ORDER.map((d) => (
        <Link key={d} to={`/legal/${d}`} className="underline">
          {label[d]}
        </Link>
      ))}
    </nav>
  )
}

export default function LegalPage() {
  const { doc } = useParams()
  const { t, lang } = useI18n()
  const d = (ORDER.includes(doc as LegalDoc) ? doc : 'impressum') as LegalDoc
  return (
    <>
      <TopBar title={LEGAL_TITLES[d].split(' (')[0]} back={window.history.length > 1 ? true : '/'} />
      <Page>
        {lang !== 'de' && <p className="mb-4 rounded-lg bg-soft px-3 py-2 text-sm">{t('legalGermanOnly')}</p>}
        {!operatorComplete() && <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{t('legalOperatorMissing')}</p>}
        <Card className="space-y-4 text-[15px] leading-relaxed">
          <h1 className="text-xl font-bold">{LEGAL_TITLES[d]}</h1>
          {LEGAL_DOCS[d].map((b, i) => (
            <section key={i} className="space-y-2">
              {b.h && <h2 className="pt-2 font-bold">{b.h}</h2>}
              {b.p?.map((s, j) => (
                <p key={j}>
                  <Text s={s} />
                </p>
              ))}
              {b.list && (
                <ul className="list-disc space-y-1 pl-5">
                  {b.list.map((s, j) => (
                    <li key={j}>
                      <Text s={s} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </Card>
        <LegalLinks className="mt-6" />
      </Page>
    </>
  )
}
