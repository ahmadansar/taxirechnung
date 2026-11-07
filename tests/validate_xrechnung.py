"""Validate XRechnung/CII files: EN 16931 XSD + EN 16931 schematron (CEN rules, via the
factur-x package) + XRechnung-specific BR-DE checks re-implemented here.
usage: python3 tests/validate_xrechnung.py file.xml [...]"""
import os, sys
from lxml import etree
import facturx
from saxonche import PySaxonProcessor

BASE = os.path.join(os.path.dirname(facturx.__file__), 'xsd_and_schematron', 'facturx-en16931')
XSD = etree.XMLSchema(etree.parse(os.path.join(BASE, 'Factur-X_EN16931.xsd')))
NS = {'rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
      'ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
      'svrl': 'http://purl.oclc.org/dsdl/svrl'}

def br_de(doc):
    x = lambda p: doc.xpath(p, namespaces=NS)
    errs = []
    def need(rule, path, msg):
        if not x(path): errs.append(f'{rule}: {msg}')
    need('BR-DE-1', '//ram:SpecifiedTradeSettlementPaymentMeans', 'payment instructions')
    need('BR-DE-2/5', '//ram:SellerTradeParty/ram:DefinedTradeContact/ram:PersonName[normalize-space()]', 'seller contact name')
    need('BR-DE-6', '//ram:SellerTradeParty/ram:DefinedTradeContact/ram:TelephoneUniversalCommunication/ram:CompleteNumber[normalize-space()]', 'seller phone')
    need('BR-DE-7', '//ram:SellerTradeParty/ram:DefinedTradeContact/ram:EmailURIUniversalCommunication/ram:URIID[normalize-space()]', 'seller email')
    need('BR-DE-3', '//ram:SellerTradeParty/ram:PostalTradeAddress/ram:CityName[normalize-space()]', 'seller city')
    need('BR-DE-4', '//ram:SellerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode[normalize-space()]', 'seller postcode')
    need('BR-DE-8', '//ram:BuyerTradeParty/ram:PostalTradeAddress/ram:CityName[normalize-space()]', 'buyer city')
    need('BR-DE-9', '//ram:BuyerTradeParty/ram:PostalTradeAddress/ram:PostcodeCode[normalize-space()]', 'buyer postcode')
    need('BR-DE-15', '//ram:ApplicableHeaderTradeAgreement/ram:BuyerReference[normalize-space()]', 'buyer reference')
    need('BT-34', '//ram:SellerTradeParty/ram:URIUniversalCommunication/ram:URIID[@schemeID][normalize-space()]', 'seller electronic address')
    need('BT-49', '//ram:BuyerTradeParty/ram:URIUniversalCommunication/ram:URIID[@schemeID][normalize-space()]', 'buyer electronic address')
    if x("//ram:ApplicableTradeTax/ram:CategoryCode[.='S']"):
        need('BR-DE-16', "//ram:SellerTradeParty/ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA' or @schemeID='FC']", 'seller VAT id or tax number')
    tc = x('string(//rsm:ExchangedDocument/ram:TypeCode)')
    if tc not in ('326', '380', '384', '389', '381', '875', '876', '877'): errs.append(f'BR-DE-17: type code {tc}')
    if x('string(//ram:GuidelineSpecifiedDocumentContextParameter/ram:ID)') != 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0':
        errs.append('BR-DE-21: specification identifier')
    for code in x('//ram:SpecifiedTradeSettlementPaymentMeans/ram:TypeCode/text()'):
        if code in ('30', '58'):
            need('BR-DE-23', '//ram:PayeePartyCreditorFinancialAccount/ram:IBANID[normalize-space()]', 'IBAN for credit transfer')
        if code in ('48', '54', '55'): need('BR-DE-24', '//ram:ApplicableTradeSettlementFinancialCard', 'card info')
    if tc == '384': need('BR-DE-26', '//ram:InvoiceReferencedDocument', 'preceding invoice')
    return errs

def main(files):
    ok = True
    with PySaxonProcessor(license=False) as proc:
        xslt = proc.new_xslt30_processor().compile_stylesheet(stylesheet_file=os.path.join(BASE, 'FACTUR-X_EN16931.xslt'))
        for f in files:
            doc = etree.parse(f)
            problems = []
            if not XSD.validate(doc):
                problems += [f'XSD: {e.message}' for e in XSD.error_log]
            svrl = etree.fromstring(xslt.transform_to_string(xdm_node=proc.parse_xml(xml_file_name=os.path.abspath(f))).encode())
            for fa in svrl.xpath('//svrl:failed-assert', namespaces=NS):
                # FX-* rules restrict Factur-X profile IDs only; XRechnung uses its own ID (BR-DE-21 below)
                if (fa.get('id') or '').startswith('FX-SCH-'): continue
                flag = fa.get('flag', 'fatal')
                text = ' '.join(fa.xpath('string(svrl:text)', namespaces=NS).split())
                problems.append(f'SCH[{flag}] {fa.get("id")}: {text[:140]}')
            problems += br_de(doc)
            fatal = [p for p in problems if not p.startswith('SCH[warning]')]
            ok &= not fatal
            print(('OK  ' if not fatal else 'FAIL') + ' ' + os.path.basename(f))
            for p in problems: print('     ', p)
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main(sys.argv[1:])
