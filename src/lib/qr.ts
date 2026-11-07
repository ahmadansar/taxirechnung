import QRCode from 'qrcode'
import type { Invoice } from './types'
import type { PdfExtras } from './pdf'
import type { Company } from './types'

/** Name of the account holder for transfers: own field, otherwise the company name. */
export const accountHolder = (s: Pick<Company, 'name' | 'account_holder'>) => (s.account_holder ?? '').trim() || s.name

export const qrPng = (text: string) => QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 300 })

/** EPC069-12 "GiroCode" payload for SEPA credit transfers (scanned by German banking apps). */
export function epcPayload(name: string, iban: string, bic: string, cents: number, reference: string) {
  return [
    'BCD',
    '002',
    '1',
    'SCT',
    bic.replace(/\s/g, '').toUpperCase(),
    name.slice(0, 70),
    iban.replace(/\s/g, '').toUpperCase(),
    'EUR' + (cents / 100).toFixed(2),
    '',
    '',
    reference.slice(0, 140),
  ].join('\n')
}

export const isOpenForPayment = (inv: Invoice) =>
  inv.kind === 'invoice' && inv.status === 'issued' && !inv.paid && inv.totals.gross > 0

/** GiroCode (bank transfer QR) and payment-page link for the PDF, for open transfer invoices. */
export async function pdfExtras(inv: Invoice, payUrl: string | null): Promise<PdfExtras> {
  if (!isOpenForPayment(inv) || inv.payment_method === 'cash' || inv.payment_method === 'card') return {}
  const s = inv.seller
  const wantsGiro = !!s.iban && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account')
  const giroQr = wantsGiro ? await qrPng(epcPayload(accountHolder(s), s.iban, s.bic, inv.totals.gross, `Rechnung ${inv.number}`)) : null
  return { payUrl: wantsGiro ? payUrl : null, giroQr }
}
