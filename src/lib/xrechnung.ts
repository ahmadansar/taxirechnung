// XRechnung 3.0 (UN/CEFACT CII syntax) – the German e-invoice format (EN 16931).
// Required for B2B invoices above 250 € from 2027/2028 (issuing); recipients must accept it since 2025.
// Self-contained (no app imports besides types) so it can be validated in tests.
import type { Company, Invoice, PartySnapshot } from './types'

export const XRECHNUNG_ID = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'
const PEPPOL_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const amt = (cents: number) => (cents / 100).toFixed(2)
const d8 = (iso: string) => iso.slice(0, 10).replace(/-/g, '')
const dt = (iso: string) => `<udt:DateTimeString format="102">${d8(iso)}</udt:DateTimeString>`
const txt = (tag: string, v: string | null | undefined) => (v && v.trim() ? `<${tag}>${esc(v.trim())}</${tag}>` : '')
const price = (n: number) => {
  const s = n.toFixed(6).replace(/0+$/, '')
  return s.endsWith('.') ? s + '00' : s.split('.')[1].length < 2 ? s + '0' : s
}

/** True when the customer is a business – those get an XRechnung. */
export const isB2B = (inv: Invoice) => !!inv.customer && !!inv.customer.company_name.trim()

/** Lists what is missing for a valid XRechnung (empty list = ready). German texts for the UI. */
export function xrechnungMissing(inv: Invoice): string[] {
  const s = inv.seller as Company
  const c = inv.customer as PartySnapshot | null
  const m: string[] = []
  if (!s.owner_name.trim()) m.push('Firma: Inhaber/Ansprechpartner')
  if (!s.phone.trim()) m.push('Firma: Telefon')
  if (!s.email.trim()) m.push('Firma: E-Mail')
  if (!s.street.trim() || !s.zip.trim() || !s.city.trim()) m.push('Firma: Anschrift')
  if (!s.vat_id.trim() && !s.tax_number.trim()) m.push('Firma: Steuernummer oder USt-IdNr.')
  if (!c) m.push('Kunde (Name und Anschrift)')
  else {
    if (!c.street.trim() || !c.zip.trim() || !c.city.trim()) m.push('Kunde: Anschrift')
    if (!c.email.trim()) m.push('Kunde: E-Mail-Adresse')
  }
  const transfer = inv.kind === 'invoice' && !inv.paid && (inv.payment_method === 'transfer' || inv.payment_method === 'on_account')
  if (transfer && !s.iban.trim()) m.push('Firma: IBAN')
  return m
}

interface Line {
  name: string
  qty: number
  net: number // cents, line net amount
  rate: number
  cat: 'S' | 'E' | 'Z'
}

/** Splits each VAT group's net amount onto its lines so the lines add up exactly (BR-CO-10, BR-S-08). */
function buildLines(inv: Invoice, sign: number): Line[] {
  const small = (inv.seller as Company).small_business
  const lines: Line[] = inv.items.map((it) => {
    const rate = small ? 0 : it.vat_rate
    const gross = Math.round(it.quantity * it.unit_price_gross) * sign
    return {
      name: it.description || 'Taxifahrt',
      qty: Math.abs(it.quantity),
      net: rate === 0 ? gross : Math.round((gross * 100) / (100 + rate)),
      rate,
      cat: small ? 'E' : rate === 0 ? 'Z' : 'S',
    }
  })
  for (const g of inv.totals.lines) {
    const target = g.net * sign
    const members = lines.filter((l) => l.rate === (small ? 0 : g.rate))
    const diff = target - members.reduce((s, l) => s + l.net, 0)
    if (diff && members.length) members.reduce((a, b) => (Math.abs(b.net) > Math.abs(a.net) ? b : a)).net += diff
  }
  return lines
}

export function buildXRechnung(inv: Invoice): string {
  const s = inv.seller as Company
  const c = inv.customer as PartySnapshot
  const credit = inv.kind === 'storno'
  const sign = credit ? -1 : 1 // credit notes carry positive amounts
  const lines = buildLines(inv, sign)
  const t = inv.totals
  const gross = t.gross * sign
  const net = t.net * sign
  const vat = t.vat * sign
  const paidAlready = !credit && (inv.paid || inv.payment_method === 'cash' || inv.payment_method === 'card')
  const prepaid = paidAlready ? gross : 0
  const due = gross - prepaid

  const pmCode = credit ? '1' : inv.payment_method === 'cash' ? '10' : inv.payment_method === 'card' ? '1' : '58'
  const pmText = credit ? 'Gutschrift / Verrechnung' : { cash: 'Barzahlung', card: 'Kartenzahlung', transfer: 'Überweisung', on_account: 'Überweisung' }[inv.payment_method]
  const notes = [
    `Fahrt am ${inv.trip.date.split('-').reverse().join('.')}${inv.trip.time ? ' ' + inv.trip.time + ' Uhr' : ''}` +
      (inv.trip.from || inv.trip.to ? `: ${[inv.trip.from, inv.trip.to].filter(Boolean).join(' – ')}` : '') +
      (inv.trip.km != null ? ` (${String(inv.trip.km).replace('.', ',')} km)` : ''),
    inv.notes,
    s.small_business ? 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' : '',
  ].filter((n) => n && n.trim())

  const taxRegs =
    (s.vat_id.trim() ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(s.vat_id.trim())}</ram:ID></ram:SpecifiedTaxRegistration>` : '') +
    (s.tax_number.trim() ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(s.tax_number.trim())}</ram:ID></ram:SpecifiedTaxRegistration>` : '')

  const lineXml = lines
    .map(
      (l, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.name)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${price(l.qty ? l.net / 100 / l.qty : 0)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${price(l.qty)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.cat}</ram:CategoryCode><ram:RateApplicablePercent>${l.rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(l.net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('')

  const taxXml = t.lines
    .map((g) => {
      const cat = s.small_business ? 'E' : g.rate === 0 ? 'Z' : 'S'
      return `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amt(g.vat * sign)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>${cat === 'E' ? '\n        <ram:ExemptionReason>Kleinunternehmer gemäß § 19 UStG</ram:ExemptionReason>' : ''}
        <ram:BasisAmount>${amt(g.net * sign)}</ram:BasisAmount>
        <ram:CategoryCode>${cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${s.small_business ? 0 : g.rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`
    })
    .join('')

  const dueDate = inv.due_date ?? inv.issue_date
  const terms =
    due !== 0
      ? `
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(credit ? 'Der Betrag wird erstattet bzw. verrechnet.' : `Zahlbar ohne Abzug bis ${dueDate.split('-').reverse().join('.')}.`)}</ram:Description>${credit ? '' : `
        <ram:DueDateDateTime>${dt(dueDate)}</ram:DueDateDateTime>`}
      </ram:SpecifiedTradePaymentTerms>`
      : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${PEPPOL_PROCESS}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${XRECHNUNG_ID}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${credit ? '381' : '380'}</ram:TypeCode>
    <ram:IssueDateTime>${dt(inv.issue_date)}</ram:IssueDateTime>${notes.map((n) => `\n    <ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`).join('')}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc((inv.reference || inv.number).trim())}</ram:BuyerReference>
      <ram:SellerTradeParty>${!s.vat_id.trim() ? `
        <ram:ID>${esc((s.tax_number || s.concession_number || s.name).trim())}</ram:ID>` : ''}
        <ram:Name>${esc(s.name)}</ram:Name>
        <ram:DefinedTradeContact>
          ${txt('ram:PersonName', s.owner_name)}
          <ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(s.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication><ram:URIID>${esc(s.email)}</ram:URIID></ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(s.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(s.street)}</ram:LineOne>
          <ram:CityName>${esc(s.city)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(s.email)}</ram:URIID></ram:URIUniversalCommunication>
        ${taxRegs}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(c.company_name || c.name)}</ram:Name>${c.company_name && c.name ? `
        <ram:DefinedTradeContact><ram:PersonName>${esc(c.name)}</ram:PersonName></ram:DefinedTradeContact>` : ''}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(c.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(c.street)}</ram:LineOne>
          <ram:CityName>${esc(c.city)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(c.email)}</ram:URIID></ram:URIUniversalCommunication>${c.vat_id ? `
        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(c.vat_id)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${dt(inv.trip.date)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${esc(inv.number)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${pmCode}</ram:TypeCode>
        <ram:Information>${esc(pmText)}</ram:Information>${pmCode === '58' ? `
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(s.iban.replace(/\s/g, '').toUpperCase())}</ram:IBANID><ram:AccountName>${esc((s.account_holder ?? '').trim() || s.name)}</ram:AccountName></ram:PayeePartyCreditorFinancialAccount>${s.bic.trim() ? `
        <ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(s.bic.replace(/\s/g, '').toUpperCase())}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>${taxXml}${terms}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amt(vat)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(gross)}</ram:GrandTotalAmount>${prepaid ? `
        <ram:TotalPrepaidAmount>${amt(prepaid)}</ram:TotalPrepaidAmount>` : ''}
        <ram:DuePayableAmount>${amt(due)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${credit && inv.storno_of_number ? `
      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(inv.storno_of_number)}</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>` : ''}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`
}

export const xrechnungFilename = (inv: Invoice) => `${inv.kind === 'storno' ? 'Gutschrift' : 'Rechnung'}_${inv.number}_XRechnung.xml`
