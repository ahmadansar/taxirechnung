// Payment reminders: the app proposes, the owner/driver reviews and approves before anything is sent.
import { jsPDF } from 'jspdf'
import { addDays, fmtDate, fmtEUR, todayISO } from './money'
import { isOpen } from './status'
import type { PdfExtras } from './pdf'
import { accountHolder } from './qr'
import type { Invoice } from './types'

export const REMINDER_PAUSE_DAYS = 7 // no new proposal within a week of the last reminder
export const MAX_REMINDERS = 3

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
export const daysOverdue = (inv: Invoice, today = todayISO()) => (inv.due_date ? daysBetween(inv.due_date, today) : 0)

export const isOverdue = (inv: Invoice, today = todayISO()) => isOpen(inv) && !!inv.due_date && inv.due_date < today

/** Overdue invoices, most urgent first (longest overdue, then highest amount). */
export function overdueByUrgency(list: Invoice[], today = todayISO()): Invoice[] {
  return list
    .filter((i) => isOverdue(i, today))
    .sort((a, b) => daysOverdue(b, today) - daysOverdue(a, today) || b.totals.gross - a.totals.gross)
}

/** Should the app propose a (next) reminder for this invoice today? */
export function reminderDue(inv: Invoice, today = todayISO()) {
  if (!isOverdue(inv, today) || (inv.reminder_count ?? 0) >= MAX_REMINDERS) return false
  return !inv.last_reminder_at || daysBetween(inv.last_reminder_at, today) >= REMINDER_PAUSE_DAYS
}

export type ReminderLevel = 1 | 2 | 3
export const nextLevel = (inv: Invoice): ReminderLevel => Math.min(MAX_REMINDERS, (inv.reminder_count ?? 0) + 1) as ReminderLevel
export const levelTitle = (l: ReminderLevel) => (l === 1 ? 'Zahlungserinnerung' : l === 2 ? '1. Mahnung' : '2. Mahnung')

// "Guten Tag Frau Berg," for people; companies without a named contact get the formal greeting
const greeting = (inv: Invoice) => {
  const n = inv.customer?.name?.trim() ?? ''
  const person = /^(frau|herr|dr\.?)\s/i.test(n) || (!!n && !inv.customer?.company_name)
  return person ? `Guten Tag ${n},` : 'Sehr geehrte Damen und Herren,'
}

/** Proposed letter text (German, polite → firmer). The user can edit it before approving. */
export function proposeReminderText(inv: Invoice, level: ReminderLevel, newDue: string) {
  const amount = fmtEUR(inv.totals.gross)
  const ref = `Rechnung ${inv.number} vom ${fmtDate(inv.issue_date)}`
  const body =
    level === 1
      ? `sicher ist es im Alltag untergegangen: Für unsere ${ref} über ${amount} haben wir bis heute keinen Zahlungseingang feststellen können.\n\nWir bitten Sie, den Betrag bis zum ${fmtDate(newDue)} zu überweisen. Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.`
      : level === 2
        ? `leider ist unsere ${ref} über ${amount} trotz unserer Zahlungserinnerung weiterhin offen.\n\nBitte überweisen Sie den Betrag bis spätestens ${fmtDate(newDue)}. Falls es Unklarheiten zur Rechnung gibt, melden Sie sich gerne bei uns.`
        : `unsere ${ref} über ${amount} ist trotz Erinnerung und Mahnung noch immer nicht bezahlt.\n\nWir fordern Sie auf, den Betrag bis spätestens ${fmtDate(newDue)} zu begleichen. Andernfalls behalten wir uns weitere Schritte vor.`
  return `${greeting(inv)}\n\n${body}\n\nMit freundlichen Grüßen\n${inv.seller.owner_name || inv.seller.name}`
}

export const reminderDueDate = (today = todayISO()) => addDays(today, 7)
export const reminderFilename = (inv: Invoice, level: ReminderLevel) => `${levelTitle(level).replace(/[ .]+/g, '_')}_${inv.number}.pdf`

/** DIN-5008-style reminder letter with the bank details and GiroCode. */
export function buildReminderPdf(inv: Invoice, level: ReminderLevel, text: string, newDue: string, extras: PdfExtras = {}): Blob {
  const s = inv.seller
  const L = 20
  const R = 190
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `${levelTitle(level)} ${inv.number}`, author: s.name, creator: 'TaxiRechnung' })
  const grey = () => doc.setTextColor(110, 110, 105)
  const ink = () => doc.setTextColor(20, 20, 20)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  ink()
  doc.text(s.name, L, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  grey()
  doc.text([[s.street, `${s.zip} ${s.city}`].filter((x) => x.trim()).join(', '), [s.phone && 'Tel. ' + s.phone, s.email].filter(Boolean).join('  ·  ')], L, 26)

  doc.setFontSize(7)
  doc.text([s.name, s.street, `${s.zip} ${s.city}`].filter((x) => x && x.trim()).join(' · '), L, 50)
  ink()
  doc.setFontSize(10.5)
  const c = inv.customer
  const recipient = c
    ? [c.company_name, c.company_name && c.name ? 'z. Hd. ' + c.name : c.name, c.street, `${c.zip} ${c.city}`].filter((x) => x && x.trim())
    : ['Fahrgast']
  doc.text(recipient as string[], L, 57)

  doc.setFontSize(9)
  const info: [string, string][] = [
    ['Datum', fmtDate(todayISO())],
    ['Rechnungs-Nr.', inv.number],
    ['Rechnungsdatum', fmtDate(inv.issue_date)],
    ['Fällig seit', fmtDate(inv.due_date)],
  ]
  let y = 55
  for (const [k, v] of info) {
    grey()
    doc.setFont('helvetica', 'normal')
    doc.text(k, 125, y)
    ink()
    doc.setFont('helvetica', 'bold')
    doc.text(v, R, y, { align: 'right' })
    y += 5
  }

  y = 100
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(`${levelTitle(level)} zur Rechnung ${inv.number}`, L, y)
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  for (const para of text.split('\n')) {
    const lines = doc.splitTextToSize(para || ' ', R - L) as string[]
    doc.text(lines, L, y)
    y += lines.length * 5
  }

  y += 6
  doc.setFillColor(242, 242, 238)
  doc.rect(L, y - 5, R - L, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.text('Offener Betrag', L + 2, y + 0.5)
  doc.text(fmtEUR(inv.totals.gross).replace(/[  ]/g, ' '), R - 2, y + 0.5, { align: 'right' })
  y += 12

  if (s.iban) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const bank = [`Kontoinhaber: ${accountHolder(s)}`, `IBAN: ${s.iban}`, s.bic && `BIC: ${s.bic}`, s.bank_name && `Bank: ${s.bank_name}`, `Verwendungszweck: Rechnung ${inv.number}`, `Bitte bis ${fmtDate(newDue)}`].filter(Boolean) as string[]
    doc.text(bank, L, y)
    if (extras.giroQr) {
      doc.addImage(extras.giroQr, 'PNG', R - 32, y - 5, 32, 32)
      grey()
      doc.setFontSize(7.5)
      doc.text('GiroCode: mit der Banking-App scannen', R, y + 30, { align: 'right' })
    }
  }

  grey()
  doc.setFontSize(7.5)
  const foot = [s.tax_number && `Steuernr. ${s.tax_number}`, s.vat_id && `USt-IdNr. ${s.vat_id}`, s.concession_number && `Konz.-Nr. ${s.concession_number}`].filter(Boolean).join('  ·  ')
  if (foot) doc.text(foot, L, 285)
  return doc.output('blob')
}
