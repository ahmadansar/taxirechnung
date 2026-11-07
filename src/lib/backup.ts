// Full backup as one ZIP: every invoice as PDF (the archived original where available),
// XRechnung XML for business customers, CSV for the tax advisor and a JSON copy of all data.
import JSZip from 'jszip'
import { exportInvoicesCsv } from './exportCsv'
import { buildInvoicePdf, invoiceFilename } from './pdf'
import { pdfExtras } from './qr'
import { downloadBlob } from './share'
import { store } from './store'
import { payLinkFor } from './store/common'
import { buildXRechnung, isB2B, xrechnungFilename, xrechnungMissing } from './xrechnung'

const DAY = 86_400_000
export const BACKUP_INTERVAL_DAYS = 30

export function backupDue(lastBackup: string | null | undefined, invoiceCount: number) {
  if (!invoiceCount) return false
  return !lastBackup || Date.now() - Date.parse(lastBackup) > BACKUP_INTERVAL_DAYS * DAY
}

export async function downloadFullBackup(onProgress?: (done: number, total: number) => void) {
  const [company, customers, invoices] = await Promise.all([store.getCompany(), store.listCustomers(), store.listInvoices()])
  const zip = new JSZip()
  const date = new Date().toISOString().slice(0, 10)
  let done = 0
  for (const inv of invoices) {
    let pdf = store.getArchivedFile ? await store.getArchivedFile(inv, 'pdf') : null
    if (!pdf) {
      const byTransfer = inv.payment_method === 'transfer' || inv.payment_method === 'on_account'
      const url = byTransfer && inv.payment_token && inv.seller.iban && !inv.paid ? payLinkFor(inv.payment_token) : null
      pdf = buildInvoicePdf(inv, await pdfExtras(inv, url).catch(() => ({})))
    }
    zip.file(`Rechnungen/${invoiceFilename(inv)}`, pdf)
    if (isB2B(inv) && xrechnungMissing(inv).length === 0) {
      const xml = (store.getArchivedFile ? await store.getArchivedFile(inv, 'xml') : null) ?? buildXRechnung(inv)
      zip.file(`XRechnung/${xrechnungFilename(inv)}`, xml)
    }
    onProgress?.(++done, invoices.length)
  }
  zip.file('Rechnungen.csv', exportInvoicesCsv(invoices))
  zip.file('Datensicherung.json', JSON.stringify({ exported_at: new Date().toISOString(), company, customers, invoices }, null, 2))
  zip.file(
    'LIESMICH.txt',
    [
      `Datensicherung TaxiRechnung – ${company?.name ?? ''} – ${date}`,
      '',
      'Rechnungen/   alle Rechnungen als PDF (archivierte Originale, sofern vorhanden)',
      'XRechnung/    E-Rechnungen (XML) für Geschäftskunden',
      'Rechnungen.csv  Übersicht für den Steuerberater (Excel)',
      'Datensicherung.json  alle Daten maschinenlesbar',
      '',
      'Aufbewahrungsfrist für Rechnungen: 8 Jahre (§ 14b UStG, § 147 AO).',
      'Bitte diese Datei sicher aufbewahren (z. B. externe Festplatte oder Cloud-Speicher).',
    ].join('\r\n'),
  )
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  await downloadBlob(blob, `TaxiRechnung_Datensicherung_${date}.zip`)
  await store.markBackup().catch(() => {}) // download already succeeded
  return invoices.length
}
