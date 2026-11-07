// German invoice PDF (§ 14 UStG / § 33 UStDV), DIN 5008-style layout, A4.
import { jsPDF } from 'jspdf'
import { fmtDate, fmtEUR, isSmallInvoice, lineTotal } from './money'
import type { Invoice } from './types'
import { accountHolder } from './qr'

const L = 20 // left margin (mm)
const R = 190 // right edge
const FOOTER_Y = 272

const eur = (c: number) => fmtEUR(c).replace(/[  ]/g, ' ')
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('de-DE', { maximumFractionDigits: 2 }))
const PM: Record<string, string> = { cash: 'bar', card: 'mit Karte', transfer: 'per Überweisung', on_account: 'auf Rechnung' }

export function invoiceFilename(inv: Invoice) {
  return `${inv.kind === 'storno' ? 'Stornorechnung' : 'Rechnung'}_${inv.number}.pdf`
}

export interface PdfExtras {
  payUrl?: string | null // link to the customer's payment page (bank details to copy)
  giroQr?: string | null // PNG data URL of the GiroCode (EPC bank transfer QR)
}

export function buildInvoicePdf(inv: Invoice, extras: PdfExtras = {}): Blob {
  const s = inv.seller
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `Rechnung ${inv.number}`, author: s.name, creator: 'TaxiRechnung' })
  const ink = () => doc.setTextColor(20, 20, 20)
  const grey = () => doc.setTextColor(110, 110, 105)
  const font = (style: 'normal' | 'bold', size: number) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
  }

  // ── Header ──────────────────────────────────────────────
  let logoW = 0
  if (s.logo_data_url) {
    try {
      const p = doc.getImageProperties(s.logo_data_url)
      const h = 20
      logoW = Math.min(50, (p.width / p.height) * h)
      const hh = logoW / (p.width / p.height)
      doc.addImage(s.logo_data_url, R - logoW, 12, logoW, hh)
    } catch {
      /* ignore broken logo */
    }
  }
  ink()
  font('bold', 17)
  doc.text(doc.splitTextToSize(s.name, 120 - (logoW ? 0 : 0)), L, 20)
  font('normal', 9)
  grey()
  const headLines = [
    [s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    [s.phone && 'Tel. ' + s.phone, s.email].filter(Boolean).join('  ·  '),
  ].filter(Boolean)
  doc.text(headLines, L, 26)

  // ── Sender line + recipient (address window) ────────────
  font('normal', 7)
  grey()
  const sender = [s.name, s.street, [s.zip, s.city].join(' ')].filter((x) => x && x.trim()).join(' · ')
  doc.text(sender, L, 50)
  doc.setDrawColor(180, 180, 175)
  doc.setLineWidth(0.2)
  doc.line(L, 51.2, L + Math.min(85, doc.getTextWidth(sender)), 51.2)

  ink()
  font('normal', 10.5)
  const c = inv.customer
  const recipient = c
    ? [c.company_name, c.company_name && c.name ? 'z. Hd. ' + c.name : c.name, c.street, [c.zip, c.city].filter(Boolean).join(' ')].filter(
        (x) => x && x.trim(),
      )
    : ['Barverkauf / Fahrgast']
  doc.text(recipient as string[], L, 57)
  if (c?.vat_id) {
    font('normal', 8.5)
    grey()
    doc.text('USt-IdNr.: ' + c.vat_id, L, 57 + recipient.length * 4.6 + 1)
  }

  // ── Info block (right) ──────────────────────────────────
  const info: [string, string][] = [
    ['Rechnungs-Nr.', inv.number],
    ['Rechnungsdatum', fmtDate(inv.issue_date)],
    ['Leistungsdatum', fmtDate(inv.trip.date)],
  ]
  if (inv.reference) info.push(['Kostenstelle/Ref.', inv.reference])
  if (inv.kind === 'storno' && inv.storno_of_number) info.push(['Storno zu', inv.storno_of_number])
  if (inv.due_date && !inv.paid && inv.kind === 'invoice' && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account'))
    info.push(['Zahlbar bis', fmtDate(inv.due_date)])
  let y = 55
  for (const [k, v] of info) {
    font('normal', 9)
    grey()
    doc.text(k, 125, y)
    font('bold', 9)
    ink()
    doc.text(v, R, y, { align: 'right' })
    y += 5
  }

  // ── Title ───────────────────────────────────────────────
  y = Math.max(y, 57 + recipient.length * 4.6) + 14
  y = Math.max(y, 100)
  ink()
  font('bold', 16)
  doc.text(inv.kind === 'storno' ? 'Stornorechnung' : 'Rechnung', L, y)
  y += 8

  // ── Trip details ───────────────────────────────────────
  const t = inv.trip
  font('normal', 9.5)
  const tripRows: [string, string][] = []
  tripRows.push(['Fahrt am', fmtDate(t.date) + (t.time ? `, ${t.time} Uhr` : '')])
  if (t.from) tripRows.push(['Von', t.from])
  if (t.to) tripRows.push(['Nach', t.to])
  const extra = [
    t.km != null && !Number.isNaN(t.km) ? `${String(t.km).replace('.', ',')} km` : '',
    t.passengers ? `${t.passengers} Pers.` : '',
    t.vehicle_plate ? `Fahrzeug ${t.vehicle_plate}` : '',
    t.driver ? `Fahrer/in ${t.driver}` : '',
  ].filter(Boolean)
  if (extra.length) tripRows.push(['Details', extra.join('  ·  ')])
  for (const [k, v] of tripRows) {
    grey()
    doc.text(k, L, y)
    ink()
    const lines = doc.splitTextToSize(v, R - L - 25)
    doc.text(lines, L + 25, y)
    y += lines.length * 4.6
  }
  y += 5

  // ── Items table ────────────────────────────────────────
  const cols = { pos: L, desc: L + 9, qty: 128, unit: 153, vat: 166, total: R }
  const tableHeader = () => {
    doc.setFillColor(242, 242, 238)
    doc.rect(L, y - 4.5, R - L, 7, 'F')
    font('bold', 8.5)
    ink()
    doc.text('Pos.', cols.pos + 1, y)
    doc.text('Beschreibung', cols.desc, y)
    doc.text('Menge', cols.qty, y, { align: 'right' })
    doc.text('Einzelpreis', cols.unit, y, { align: 'right' })
    if (!s.small_business) doc.text('USt', cols.vat, y, { align: 'right' })
    doc.text('Betrag', cols.total, y, { align: 'right' })
    y += 7
  }
  const ensure = (h: number) => {
    if (y + h > FOOTER_Y - 8) {
      doc.addPage()
      y = 25
      tableHeader()
    }
  }
  tableHeader()
  font('normal', 9.5)
  inv.items.forEach((it, i) => {
    const desc = doc.splitTextToSize(it.description || '–', cols.qty - cols.desc - 14)
    ensure(desc.length * 4.6 + 2)
    font('normal', 9.5)
    ink()
    doc.text(String(i + 1), cols.pos + 1, y)
    doc.text(desc, cols.desc, y)
    doc.text(qty(it.quantity), cols.qty, y, { align: 'right' })
    doc.text(eur(it.unit_price_gross), cols.unit, y, { align: 'right' })
    if (!s.small_business) doc.text(`${it.vat_rate} %`, cols.vat, y, { align: 'right' })
    doc.text(eur(lineTotal(it)), cols.total, y, { align: 'right' })
    y += desc.length * 4.6 + 1.5
    doc.setDrawColor(225, 225, 220)
    doc.line(L, y - 2.5, R, y - 2.5)
  })
  font('normal', 8)
  grey()
  if (!s.small_business) doc.text('Alle Preise inkl. gesetzlicher Umsatzsteuer.', L, y + 1)

  // ── Totals ─────────────────────────────────────────────
  y += 3
  ensure(30)
  const tot = inv.totals
  const row = (label: string, val: string, bold = false) => {
    font(bold ? 'bold' : 'normal', bold ? 11 : 9.5)
    ink()
    doc.text(label, 128, y)
    doc.text(val, R, y, { align: 'right' })
    y += bold ? 7 : 5
  }
  if (!s.small_business) {
    row('Nettobetrag', eur(tot.net))
    for (const l of tot.lines) row(`zzgl. ${l.rate} % USt auf ${eur(l.net)}`, eur(l.vat))
    doc.setDrawColor(20, 20, 20)
    doc.setLineWidth(0.4)
    doc.line(128, y - 2.5, R, y - 2.5)
    y += 2
  }
  row('Gesamtbetrag', eur(tot.gross), true)
  y += 3

  // ── Notes / payment ────────────────────────────────────
  const notes: string[] = []
  if (s.small_business) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.')
  if (inv.kind === 'storno') {
    notes.push(`Diese Stornorechnung hebt die Rechnung Nr. ${inv.storno_of_number} vollständig auf.`)
  } else if (inv.paid || inv.payment_method === 'cash' || inv.payment_method === 'card') {
    notes.push(`Betrag ${PM[inv.payment_method]} erhalten${inv.paid_at ? ' am ' + fmtDate(inv.paid_at) : ''}. Vielen Dank!`)
  } else {
    const due = inv.due_date ? ` bis zum ${fmtDate(inv.due_date)}` : ''
    notes.push(
      `Bitte überweisen Sie den Gesamtbetrag${due} unter Angabe der Rechnungsnummer ${inv.number}` +
        (s.iban ? ` auf das Konto IBAN ${s.iban}${s.bic ? ' (BIC ' + s.bic + ')' : ''}.` : '.'),
    )
  }
  if (inv.notes && inv.kind !== 'storno') notes.push(inv.notes)
  if (s.footer_note) notes.push(s.footer_note)
  if (!c && isSmallInvoice(tot.gross)) notes.push('Kleinbetragsrechnung gem. § 33 UStDV.')
  font('normal', 9.5)
  ink()
  for (const n of notes) {
    const lines = doc.splitTextToSize(n, R - L)
    ensure(lines.length * 4.6 + 2)
    font('normal', 9.5)
    ink()
    doc.text(lines, L, y)
    y += lines.length * 4.6 + 2
  }

  // ── GiroCode + payment page link ───────────────────────
  if (extras.giroQr) {
    const size = 30
    ensure(size + 8)
    y += 2
    doc.addImage(extras.giroQr, 'PNG', L, y, size, size)
    const x = L + size + 5
    font('bold', 10.5)
    ink()
    doc.text('Bequem per Überweisung bezahlen', x, y + 5)
    font('normal', 8.8)
    grey()
    doc.text(['QR-Code mit Ihrer Banking-App scannen (GiroCode):', 'Empfänger, IBAN, Betrag und Verwendungszweck', 'werden automatisch ausgefüllt.'], x, y + 10.5)
    if (extras.payUrl) {
      doc.text('Bankdaten zum Kopieren:', x, y + 25)
      doc.setTextColor(20, 60, 160)
      const short = extras.payUrl.length > 70 ? extras.payUrl.slice(0, 67) + '…' : extras.payUrl
      doc.textWithLink(short, x + doc.getTextWidth('Bankdaten zum Kopieren: '), y + 25, { url: extras.payUrl })
    }
    y += size + 4
  }

  // ── Footer on every page ───────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(200, 200, 195)
    doc.setLineWidth(0.2)
    doc.line(L, FOOTER_Y, R, FOOTER_Y)
    font('normal', 7.2)
    grey()
    const col1 = [s.name, s.owner_name && 'Inh. ' + s.owner_name, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean) as string[]
    const col2 = [s.phone && 'Tel. ' + s.phone, s.email, s.website, s.concession_number && 'Konz.-Nr. ' + s.concession_number].filter(Boolean) as string[]
    const col3 = [
      s.iban && accountHolder(s) !== s.name && 'Kontoinh. ' + accountHolder(s),
      s.bank_name,
      s.iban && 'IBAN ' + s.iban,
      s.bic && 'BIC ' + s.bic,
      s.tax_number && 'St.-Nr. ' + s.tax_number,
      s.vat_id && 'USt-IdNr. ' + s.vat_id,
    ].filter(Boolean) as string[]
    doc.text(col1, L, FOOTER_Y + 4)
    doc.text(col2, 80, FOOTER_Y + 4)
    doc.text(col3, 135, FOOTER_Y + 4)
    if (pages > 1) doc.text(`Seite ${p} von ${pages}`, R, 294, { align: 'right' })
  }

  return doc.output('blob')
}
