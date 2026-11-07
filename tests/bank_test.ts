// deno test tests/bank_test.ts
import { deepStrictEqual as eq, ok } from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import { invoiceNumberRegex, matchPayments, parseAmount, parseCamt, parseCsv, parseDate, parseStatement } from '../src/lib/bank.ts'
import type { Invoice } from '../src/lib/types.ts'

const inv = (number: string, gross: number, extra: Partial<Invoice> = {}): Invoice =>
  ({
    id: number, company_id: 'c', customer_id: null, number, kind: 'invoice', storno_of: null, storno_of_number: null,
    status: 'issued', issue_date: '2026-10-20', due_date: null, customer: { company_name: 'Hotel Am Markt GmbH', name: 'Frau Schmidt', street: '', zip: '', city: '', email: '', vat_id: '' },
    seller: {} as Invoice['seller'], trip: {} as Invoice['trip'], items: [], totals: { net: 0, vat: 0, gross, lines: [] },
    payment_method: 'on_account', paid: false, paid_at: null, reference: '', notes: '', created_at: '', ...extra,
  }) as Invoice

Deno.test('amounts and dates', () => {
  eq(parseAmount('401,00'), 40100)
  eq(parseAmount('-12,50'), -1250)
  eq(parseAmount('1.234,56'), 123456)
  eq(parseAmount('1,234.56'), 123456)
  eq(parseAmount('48.50'), 4850)
  eq(parseAmount('12,50 S'), -1250)
  eq(parseAmount('12,50 H'), 1250)
  eq(parseAmount('+19,90 €'), 1990)
  eq(parseDate('31.10.26'), '2026-10-31')
  eq(parseDate('1.11.2026'), '2026-11-01')
  eq(parseDate('2026-10-31T10:00:00'), '2026-10-31')
})

Deno.test('invoice number regex', () => {
  const r = invoiceNumberRegex('RE-2026-0002')
  for (const s of ['Rechnung RE-2026-0002', 're 2026 0002 danke', 'RE2026-2', 'RG 2026-0002', 'Re-Nr: RE/2026/0002']) ok(r.test(s), s)
  for (const s of ['RE-2026-00021', 'RE-2026-0012', 'DE89 2026 0002 1234', 'Rechnung 2026-2']) ok(!r.test(s), s)
})

const SPARKASSE = `"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"
"DE00611500200000000000";"30.10.26";"30.10.26";"GUTSCHR. UEBERWEISUNG";"Rechnung RE-2026-0002 Danke";"";"";"NOTPROVIDED";"";"";"";"Hotel Am Markt GmbH";"DE12500105170648489890";"INGDDEFFXXX";"401,00";"EUR";"Umsatz gebucht"
"DE00611500200000000000";"30.10.26";"30.10.26";"KARTENZAHLUNG";"Tankstelle";"";"";"";"";"";"";"ARAL";"DE02100100100006820101";"PBNKDEFFXXX";"-65,20";"EUR";"Umsatz gebucht"
"DE00611500200000000000";"31.10.26";"31.10.26";"GUTSCHR. UEBERWEISUNG";"Taxifahrt Flughafen";"";"";"";"";"";"";"Max Beispiel";"DE02120300000000202051";"BYLADEM1001";"19,90";"EUR";"Umsatz gebucht"
"DE00611500200000000000";"31.10.26";"31.10.26";"GUTSCHR. UEBERWEISUNG";"RE-2026-0004";"";"";"";"";"";"";"Praxis Dr. Wolf";"DE02120300000000202051";"BYLADEM1001";"50,00";"EUR";"Umsatz gebucht"`

Deno.test('Sparkasse CSV → auto, review by amount, review by name', () => {
  const txs = parseCsv(SPARKASSE)
  eq(txs.length, 4)
  eq(txs[0], { date: '2026-10-30', amountCents: 40100, name: 'Hotel Am Markt GmbH', text: txs[0].text })
  ok(txs[0].text.includes('RE-2026-0002'))
  ok(!txs[0].text.includes('DE12500105170648489890'), 'IBAN is not part of the text')
  const invoices = [
    inv('RE-2026-0002', 40100),
    inv('RE-2026-0003', 1990, { customer: { company_name: '', name: 'Max Beispiel', street: '', zip: '', city: '', email: '', vat_id: '' } }),
    inv('RE-2026-0004', 5100),
    inv('RE-2026-0005', 6520), // same amount as the debit → must not match
    inv('RE-2026-0001', 2350, { payment_method: 'cash', paid: true }),
  ]
  const r = matchPayments(txs, invoices)
  eq(r.incoming, 3)
  eq(r.auto.map((m) => m.invoice.number), ['RE-2026-0002'])
  eq(r.auto[0].tx.date, '2026-10-30')
  eq(r.review.map((m) => [m.invoice.number, m.reason]).sort(), [['RE-2026-0003', 'name_and_amount'], ['RE-2026-0004', 'amount_differs']])
})

Deno.test('VR-Bank / ING / DKB style CSVs', () => {
  const vr = `"Bezeichnung Auftragskonto";"IBAN Auftragskonto";"BIC Auftragskonto";"Bankname Auftragskonto";"Buchungstag";"Valutadatum";"Name Zahlungsbeteiligter";"IBAN Zahlungsbeteiligter";"BIC (SWIFT-Code) Zahlungsbeteiligter";"Buchungstext";"Verwendungszweck";"Betrag";"Waehrung";"Saldo nach Buchung";"Bemerkung";"Kategorie";"Steuerrelevant";"Glaeubiger ID";"Mandatsreferenz"
"Geschäftskonto";"DE00600901000000000000";"VOBADESSXXX";"Volksbank";"31.10.2026";"31.10.2026";"Hotel Am Markt GmbH";"DE12500105170648489890";"INGDDEFFXXX";"Gutschrift";"RE 2026 0002";"401,00";"EUR";"5.401,00";"";"";"";"";""`
  const ing = `Umsatzanzeige;Datei erstellt am: 31.10.2026 10:00
IBAN;DE00 5001 0517 0000 0000 00
Kontoname;Girokonto

Buchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Saldo;Währung;Betrag;Währung
31.10.2026;31.10.2026;Hotel Am Markt GmbH;Gutschrift;Rechnung RE-2026-0002;5.401,00;EUR;401,00;EUR`
  const dkb = `"Konto";"Girokonto DE00120300000000000000"
""
"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"
"31.10.26";"31.10.26";"Gebucht";"Hotel Am Markt GmbH";"Taxi Muster";"RE-2026-0002";"Eingang";"DE12500105170648489890";"401,00";"";"";""`
  for (const [name, csv] of [['vr', vr], ['ing', ing], ['dkb', dkb]]) {
    const txs = parseStatement(csv)
    eq(txs.length, 1, name)
    eq(txs[0].amountCents, 40100, name)
    eq(txs[0].date, '2026-10-31', name)
    eq(matchPayments(txs, [inv('RE-2026-0002', 40100)]).auto.length, 1, name)
  }
})

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">401.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-10-30</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Dbtr><Pty><Nm>Hotel Am Markt GmbH</Nm></Pty></Dbtr></RltdPties><RmtInf><Ustrd>Rechnung RE-2026-0002</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">68.40</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-10-31</Dt></BookgDt>
 <NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Praxis Dr. Wolf</Nm></Dbtr></RltdPties><RmtInf><Ustrd>RE-2026-0006 und RE-2026-0007</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">20.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-10-31</Dt></BookgDt>
 <NtryDtls><TxDtls><RmtInf><Ustrd>RE-2026-0008</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">30.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts><Cd>PDNG</Cd></Sts><BookgDt><Dt>2026-10-31</Dt></BookgDt>
 <NtryDtls><TxDtls><RmtInf><Ustrd>RE-2026-0009</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`

Deno.test('CAMT.053: credit only, booked only, combined payment', () => {
  const txs = parseCamt(CAMT, DOMParser as unknown as typeof globalThis.DOMParser)
  eq(txs.length, 3) // pending entry skipped
  eq(txs[0], { date: '2026-10-30', amountCents: 40100, name: 'Hotel Am Markt GmbH', text: 'Rechnung RE-2026-0002' })
  eq(txs[2].amountCents, -2000)
  const r = matchPayments(txs, [inv('RE-2026-0002', 40100), inv('RE-2026-0006', 3420), inv('RE-2026-0007', 3420), inv('RE-2026-0008', 2000), inv('RE-2026-0009', 3000)])
  eq(r.auto.map((m) => m.invoice.number).sort(), ['RE-2026-0002', 'RE-2026-0006', 'RE-2026-0007'])
  eq(r.review.length, 0)
})

Deno.test('same transfer twice does not pay two invoices; old payments before invoice ignored', () => {
  const txs = [
    { date: '2026-10-30', amountCents: 1000, name: '', text: 'RE-2026-0010' },
    { date: '2026-01-05', amountCents: 1000, name: '', text: 'RE-2026-0011' },
  ]
  const r = matchPayments(txs, [inv('RE-2026-0010', 1000), inv('RE-2026-0011', 1000)])
  eq(r.auto.map((m) => m.invoice.number), ['RE-2026-0010'])
})
