/// <reference lib="dom" />
// Bank statement import: reads CAMT.052/053 (XML) or CSV exports from German online banking
// and matches incoming payments to open invoices by invoice number and amount.
// Everything runs on the device – no bank login, no third party.
// NOTE: this file is shared with the server (supabase/functions/_shared/bank.ts, copied by
// `npm run sync-shared`). Keep it free of app imports.

/** The invoice fields matching needs (a subset of the app's Invoice type). */
export interface MatchableInvoice {
  id: string
  number: string
  kind: string
  status: string
  paid: boolean
  issue_date: string
  payment_method: string
  totals: { gross: number }
  customer: { company_name: string; name: string } | null
}

export interface BankTx {
  date: string // YYYY-MM-DD (booking date)
  amountCents: number // positive = incoming
  name: string // payer
  text: string // purpose / reference text used for matching
}

export interface Match<I extends MatchableInvoice = MatchableInvoice> {
  tx: BankTx
  invoice: I
  reason: 'exact' | 'amount_differs' | 'name_and_amount' | 'combined'
}

export interface MatchResult<I extends MatchableInvoice = MatchableInvoice> {
  auto: Match<I>[] // safe: invoice number found and amount matches
  review: Match<I>[] // probable, needs a tap to confirm
  incoming: number // number of incoming payments read
}

// ───────────────────────── file decoding ─────────────────────────

/** German bank CSVs are often Windows-1252, not UTF-8. */
export function decodeBankFile(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export function parseStatement(text: string, Parser: typeof DOMParser = globalThis.DOMParser): BankTx[] {
  const head = text.slice(0, 2000)
  if (/<\?xml|<Document|camt\.05/i.test(head)) return parseCamt(text, Parser)
  return parseCsv(text)
}

// ───────────────────────── helpers ─────────────────────────

export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[€\s ]|EUR/gi, '')
  let sign = 1
  if (/[SH]$/i.test(s)) {
    if (/S$/i.test(s)) sign = -1
    s = s.slice(0, -1)
  }
  if (s.endsWith('-')) {
    sign = -sign
    s = s.slice(0, -1)
  }
  if (!s || !/\d/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = s.replace(',', '.')
  } else if (lastDot > -1 && /\.\d{3}$/.test(s) && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '') // 1.234 = thousands
  }
  const n = Number(s)
  return Number.isFinite(n) ? sign * Math.round(n * 100) : null
}

export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

const norm = (h: string) =>
  h.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/["']/g, '').trim()

// ───────────────────────── CSV ─────────────────────────

function splitCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === delim) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const isAmountHeader = (h: string) =>
  /(betrag|umsatz|amount)/.test(h) && !/(saldo|kontostand|ursprung|fremd|gebuehr|waehrung|currency|original|typ|art$|anzeige)/.test(h)
const isDateHeader = (h: string) => /(buchungstag|buchungsdatum|buchung$|^datum|\bdate\b|valuta|wertstellung)/.test(h)
const isNameHeader = (h: string) => /(beguenstigter|zahlungspflichtige|auftraggeber|empfaenger|^name|payer|counterparty|partner|zahlungsbeteiligter)/.test(h)
const isNoiseHeader = (h: string) => /(iban|bic|blz|konto|saldo|glaeubiger|mandat|waehrung|currency|kategorie)/.test(h)

export function parseCsv(text: string): BankTx[] {
  const firstLines = text.split(/\r?\n/).slice(0, 40)
  const delim = [';', '\t', ','].sort(
    (a, b) => firstLines.join('\n').split(b).length - firstLines.join('\n').split(a).length,
  )[0]
  const rows = splitCsv(text, delim)
  const headerCell = (c: string, test: (h: string) => boolean) => !/\d/.test(c) && c.length < 60 && test(norm(c))
  const hi = rows.findIndex((r, i) => i < 40 && r.some((c) => headerCell(c, isAmountHeader)) && r.some((c) => headerCell(c, isDateHeader)))
  if (hi < 0) return []
  const header = rows[hi].map(norm)
  const amountCol = (() => {
    const betrag = header.findIndex((h) => isAmountHeader(h) && h.includes('betrag'))
    return betrag >= 0 ? betrag : header.findIndex(isAmountHeader)
  })()
  const habenCol = header.findIndex((h) => h === 'haben' || h.startsWith('haben '))
  const sollCol = header.findIndex((h) => h === 'soll' || h.startsWith('soll '))
  const shCol = header.findIndex((h) => /^(soll\/haben|s\/h|soll-haben|soll \/ haben)$/.test(h))
  const dateCol = (() => {
    const pref = header.findIndex((h) => /buchung/.test(h) && isDateHeader(h))
    return pref >= 0 ? pref : header.findIndex(isDateHeader)
  })()
  const nameCol = header.findIndex(isNameHeader)
  const textCols = header.map((_h, i) => i).filter((i) => i !== amountCol && i !== dateCol && !isNoiseHeader(header[i]) && !isDateHeader(header[i]) && !isAmountHeader(header[i]))

  const out: BankTx[] = []
  for (const r of rows.slice(hi + 1)) {
    let cents: number | null = null
    if (habenCol >= 0 && r[habenCol]?.trim()) cents = Math.abs(parseAmount(r[habenCol]) ?? 0)
    else if (sollCol >= 0 && r[sollCol]?.trim() && amountCol < 0) cents = -Math.abs(parseAmount(r[sollCol]) ?? 0)
    else if (amountCol >= 0) cents = parseAmount(r[amountCol] ?? '')
    if (cents == null) continue
    if (shCol >= 0 && /^s/i.test((r[shCol] ?? '').trim())) cents = -Math.abs(cents)
    const date = parseDate(r[dateCol] ?? '')
    if (!date) continue
    out.push({
      date,
      amountCents: cents,
      name: nameCol >= 0 ? (r[nameCol] ?? '').trim() : '',
      text: textCols.map((i) => r[i] ?? '').join(' ').replace(/\s+/g, ' ').trim(),
    })
  }
  return out
}

// ───────────────────────── CAMT (ISO 20022) ─────────────────────────

export function parseCamt(xml: string, Parser: typeof DOMParser = globalThis.DOMParser): BankTx[] {
  const doc = new Parser().parseFromString(xml, 'text/xml')
  const all = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name)) as Element[]
  const first = (el: Element, ...path: string[]): Element | null => {
    let cur: Element | null = el
    for (const p of path) {
      if (!cur) return null
      cur = (Array.from(cur.childNodes) as Element[]).find((n) => n.nodeType === 1 && n.localName === p) ?? null
    }
    return cur
  }
  const txt = (el: Element | null) => (el?.textContent ?? '').trim()

  const out: BankTx[] = []
  for (const e of all(doc, 'Ntry')) {
    const status = txt(first(e, 'Sts', 'Cd')) || txt(first(e, 'Sts'))
    if (status && status !== 'BOOK') continue
    const credit = txt(first(e, 'CdtDbtInd')) === 'CRDT'
    const date = parseDate(txt(first(e, 'BookgDt', 'Dt')) || txt(first(e, 'BookgDt', 'DtTm')) || txt(first(e, 'ValDt', 'Dt'))) ?? ''
    const entryAmt = parseAmount(txt(first(e, 'Amt'))) ?? 0
    const details = all(e, 'TxDtls')
    const items = details.length ? details : [null]
    for (const d of items) {
      let amt = entryAmt
      if (d) {
        const a = first(d, 'Amt') ?? first(d, 'AmtDtls', 'TxAmt', 'Amt')
        if (a && details.length > 1) amt = parseAmount(txt(a)) ?? entryAmt
      }
      const scope: Element = d ?? e
      const purpose = [
        ...all(scope, 'Ustrd').map(txt),
        ...all(scope, 'CdtrRefInf').map((x) => txt(first(x, 'Ref'))),
        txt(first(e, 'AddtlNtryInf')),
      ]
        .filter(Boolean)
        .join(' ')
      const debtor = d ? all(d, 'Dbtr')[0] : null
      const name = debtor ? txt(first(debtor, 'Nm')) || txt(first(debtor, 'Pty', 'Nm')) : ''
      out.push({ date, amountCents: credit ? Math.abs(amt) : -Math.abs(amt), name, text: purpose.replace(/\s+/g, ' ') })
    }
  }
  return out
}

// ───────────────────────── matching ─────────────────────────

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SEP = '[\\s\\-/._:#]*'

/** Regex that finds an invoice number like RE-2026-0002 in free text
 *  (also "RE 2026 0002", "re2026-2", "2026-0002"). */
export function invoiceNumberRegex(number: string): RegExp {
  const m = number.match(/^(?:(.+?)-)?(\d{4})-(\d+)$/)
  if (!m) return new RegExp(`(?<![0-9A-Z])${number.split(/[\s\-/.]+/).map(esc).join(SEP)}(?![0-9])`, 'i')
  const [, prefix, year, seq] = m
  const seqInt = String(parseInt(seq, 10))
  // without prefix only the full padded number counts, and not inside a longer digit group (IBANs)
  const parts = [`(?<!\\d[\\s\\-/.])${year}${SEP}${esc(seq)}(?![\\s\\-/.]\\d)`]
  if (prefix) parts.unshift(`${esc(prefix)}${SEP}${year}${SEP}0*${seqInt}`)
  return new RegExp(`(?<![0-9A-Z])(?:${parts.join('|')})(?![0-9])`, 'i')
}

const nameTokens = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !['gmbh', 'firma', 'herr', 'frau', 'praxis', 'hotel', 'taxi', 'rechnung'].includes(w))

export const isMatchable = (inv: MatchableInvoice) =>
  inv.kind === 'invoice' &&
  inv.status === 'issued' &&
  !inv.paid &&
  inv.totals.gross > 0 &&
  inv.payment_method !== 'cash' &&
  inv.payment_method !== 'card'

const daysBetween = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000

export function matchPayments<I extends MatchableInvoice>(txs: BankTx[], invoices: I[]): MatchResult<I> {
  const open = invoices.filter(isMatchable)
  const regexes = new Map(open.map((i) => [i.id, invoiceNumberRegex(i.number)]))
  const incoming = txs.filter((t) => t.amountCents > 0).sort((a, b) => a.date.localeCompare(b.date))
  const used = new Set<string>()
  const auto: Match<I>[] = []
  const review: Match<I>[] = []
  const reviewed = new Set<string>()

  for (const tx of incoming) {
    const hay = `${tx.text} ${tx.name}`
    const plausible = (i: I) => !used.has(i.id) && daysBetween(tx.date, i.issue_date) >= -3
    const byNumber = open.filter((i) => plausible(i) && regexes.get(i.id)!.test(hay))

    if (byNumber.length === 1) {
      const inv = byNumber[0]
      if (inv.totals.gross === tx.amountCents) {
        auto.push({ tx, invoice: inv, reason: 'exact' })
        used.add(inv.id)
      } else if (!reviewed.has(inv.id)) {
        review.push({ tx, invoice: inv, reason: 'amount_differs' })
        reviewed.add(inv.id)
      }
      continue
    }
    if (byNumber.length > 1) {
      // one transfer for several invoices
      const sum = byNumber.reduce((s, i) => s + i.totals.gross, 0)
      for (const inv of byNumber) {
        if (sum === tx.amountCents) {
          auto.push({ tx, invoice: inv, reason: 'combined' })
          used.add(inv.id)
        } else if (!reviewed.has(inv.id)) {
          review.push({ tx, invoice: inv, reason: 'amount_differs' })
          reviewed.add(inv.id)
        }
      }
      continue
    }
    // no invoice number: same amount + customer name in payer/reference → suggest only
    const payer = new Set(nameTokens(hay))
    const byName = open.filter((i) => {
      if (!plausible(i) || reviewed.has(i.id) || i.totals.gross !== tx.amountCents || !i.customer) return false
      return nameTokens(`${i.customer.company_name} ${i.customer.name}`).some((w) => payer.has(w))
    })
    if (byName.length === 1) {
      review.push({ tx, invoice: byName[0], reason: 'name_and_amount' })
      reviewed.add(byName[0].id)
    }
  }
  // an invoice that was auto-matched later must not also be in review
  return { auto, review: review.filter((m) => !used.has(m.invoice.id)), incoming: incoming.length }
}
