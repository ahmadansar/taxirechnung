// Verfahrensdokumentation nach GoBD (Rz. 151 ff.) für die Rechnungsstellung mit TaxiRechnung.
// Vorlage, die das Unternehmen ergänzt (Felder "____"), ausdruckt, unterschreibt und aufbewahrt.
import { jsPDF } from 'jspdf'
import { fmtDate } from './money'
import type { Company } from './types'

const BLANK = '______________________________'

export function verfahrensdokuSections(c: Company): { h: string; p: string[] }[] {
  const prefix = c.invoice_prefix ? `${c.invoice_prefix}-` : ''
  const year = new Date().getFullYear()
  return [
    {
      h: '1. Allgemeine Beschreibung',
      p: [
        `Unternehmen: ${c.name}, Inhaber/in: ${c.owner_name}, ${c.street}, ${c.zip} ${c.city}`,
        `Steuernummer: ${c.tax_number || '-'}   USt-IdNr.: ${c.vat_id || '-'}   Konzessions-Nr.: ${c.concession_number || '-'}`,
        `Besteuerung: ${c.small_business ? 'Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer auf Rechnungen)' : 'Regelbesteuerung; Personenbeförderung im Taxiverkehr innerhalb der Gemeinde oder bis 50 km mit 7 % (§ 12 Abs. 2 Nr. 10 UStG), sonst 19 %'}`,
        'Gegenstand dieser Dokumentation ist die Erstellung, Ausgabe, Archivierung und Zahlungsüberwachung von Ausgangsrechnungen für Taxifahrten mit der Web-App "TaxiRechnung" (Software-as-a-Service). Die Erfassung der Bareinnahmen über Taxameter/Kassensystem und die Buchführung sind nicht Teil dieses Verfahrens und gesondert zu dokumentieren.',
        `Verantwortlich für das Verfahren: ${BLANK}   Gültig ab: ${fmtDate(new Date().toISOString())}`,
      ],
    },
    {
      h: '2. Anwenderdokumentation (Ablauf)',
      p: [
        'a) Stammdaten: Die Unternehmensdaten (Pflichtangaben nach § 14 Abs. 4 UStG) werden einmalig unter "Firma" erfasst und bei jeder Rechnung als unveränderliche Kopie in der Rechnung gespeichert. Kundendaten werden in der Kundendatenbank gespeichert; Rechnungen speichern zusätzlich eine Kopie der Kundendaten zum Ausstellungszeitpunkt.',
        'b) Rechnungserstellung: Nach der Fahrt wird eine Rechnung mit Fahrtdatum, Strecke (Start/Ziel), Leistungen, Steuersatz und Zahlungsart erfasst. Kleinbetragsrechnungen bis 250 EUR brutto (§ 33 UStDV) werden automatisch erkannt.',
        `c) Rechnungsnummern: Die Nummer wird beim Ausstellen von der Datenbank fortlaufend und lückenlos je Jahr vergeben (Schema ${prefix}${year}-0001). Eine manuelle Vergabe oder Wiederverwendung ist nicht möglich.`,
        'd) Ausgabe: Die Rechnung wird als PDF erzeugt und über das Teilen-Menü des Telefons (E-Mail, Messenger) oder als Download übergeben. Für Geschäftskunden kann zusätzlich eine E-Rechnung im Format XRechnung (EN 16931, CII) erzeugt werden.',
        'e) Korrekturen: Ausgestellte Rechnungen können nicht geändert oder gelöscht werden. Korrekturen erfolgen ausschließlich durch eine Stornorechnung mit eigener Nummer und Bezug auf die Originalrechnung; anschließend wird bei Bedarf eine neue Rechnung erstellt. Stornieren darf nur der Inhaber.',
        'g) Fahrer-Konten: Fahrer treten der Firma mit einem einmaligen Einladungscode des Inhabers bei. Sie können Rechnungen und Kunden anlegen und Zahlungen abhaken; zu jeder Rechnung wird gespeichert, wer sie ausgestellt hat. Firmendaten, Bankverbindung, Stornos und Datensicherung sind dem Inhaber vorbehalten.',
        'h) Zahlungserinnerungen: Für überfällige Rechnungen schlägt die App einen Erinnerungstext vor; er wird erst nach Prüfung und Freigabe versendet. Anzahl und Datum der Erinnerungen werden an der Rechnung vermerkt.',
        'f) Zahlungen: Der Zahlungsstatus (bezahlt/offen) wird manuell, per Import von Kontoauszügen (CSV/CAMT) oder per automatischem Bankabgleich (FinTS) gesetzt. Zahlungsdatum und Quelle werden gespeichert. Der Zahlungsstatus ist keine Rechnungsänderung.',
      ],
    },
    {
      h: '3. Technische Systemdokumentation',
      p: [
        'App: Progressive Web-App, ausgeliefert über HTTPS. Datenbank: PostgreSQL (Supabase) mit Mandantentrennung über Row Level Security.',
        'Unveränderbarkeit: Ein Datenbank-Trigger verhindert jede Änderung der Rechnungsinhalte nach Ausstellung; zulässig sind nur Zahlungsstatus, Zahlungsdatum, Zahlungsquelle, Kundenverknüpfung und Archivvermerk.',
        'Archiv: Beim ersten Öffnen nach Ausstellung wird das PDF (bei Geschäftskunden zusätzlich die XRechnung-XML) in einem Dateispeicher abgelegt, der nur Hinzufügen und Lesen erlaubt (kein Überschreiben, kein Löschen). Der Archivzeitpunkt wird an der Rechnung vermerkt.',
        'Maschinelle Auswertbarkeit: Export aller Rechnungen als CSV und JSON sowie aller Belege als PDF/XML (Datensicherung als ZIP) für die Datenträgerüberlassung nach § 147 Abs. 6 AO.',
      ],
    },
    {
      h: '4. Betriebsdokumentation (Datensicherung und Aufbewahrung)',
      p: [
        'Aufbewahrungsfrist: Rechnungen 8 Jahre (§ 14b UStG, § 147 Abs. 3 AO), beginnend mit dem Schluss des Kalenderjahres der Ausstellung.',
        `Datensicherung: Mindestens monatlich wird unter "Firma -> Datensicherung" eine ZIP-Datei heruntergeladen und an folgendem Ort zusätzlich gespeichert: ${BLANK}`,
        `Zuständig für die Datensicherung: ${BLANK}`,
        'Bei Beendigung der Nutzung der App werden vor Vertragsende alle Daten exportiert und für die restliche Aufbewahrungsfrist lesbar aufbewahrt.',
      ],
    },
    {
      h: '5. Internes Kontrollsystem (IKS)',
      p: [
        `Zugriff: Zugang zur App haben ausschließlich folgende Personen (Inhaber und eingeladene Fahrer, siehe Firma -> Team): ${BLANK}`,
        'Zugangsdaten werden nicht weitergegeben; bei Ausscheiden einer Person wird das Passwort geändert.',
        'Kontrollen: Prüfung der Rechnung vor dem Versand (Empfänger, Betrag, Steuersatz); monatliche Prüfung offener Rechnungen und der lückenlosen Nummernfolge; Abgleich mit dem Bankkonto.',
        `Weitere Regelungen: ${BLANK}`,
      ],
    },
    {
      h: '6. Änderungshistorie',
      p: [`Version 1 vom ${fmtDate(new Date().toISOString())}: Erstellung.`, `${BLANK}`, `${BLANK}`],
    },
  ]
}

export function buildVerfahrensdoku(c: Company): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: 'Verfahrensdokumentation Rechnungsstellung', author: c.name, creator: 'TaxiRechnung' })
  const L = 20
  const W = 170
  let y = 22
  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage()
      y = 20
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Verfahrensdokumentation nach GoBD', L, y)
  y += 7
  doc.setFontSize(11)
  doc.text(`Rechnungsstellung mit TaxiRechnung - ${c.name}`, L, y)
  y += 10
  for (const s of verfahrensdokuSections(c)) {
    ensure(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(s.h, L, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const para of s.p) {
      const lines = doc.splitTextToSize(para, W) as string[]
      for (const line of lines) {
        ensure(5)
        doc.text(line, L, y)
        y += 4.6
      }
      y += 2
    }
    y += 3
  }
  ensure(30)
  y += 10
  doc.line(L, y, L + 70, y)
  doc.line(L + 100, y, L + 170, y)
  doc.setFontSize(9)
  doc.text('Ort, Datum', L, y + 4)
  doc.text(`Unterschrift ${c.owner_name}`, L + 100, y + 4)
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`Seite ${i} von ${pages} - Vorlage, bitte prüfen, ergänzen und mit dem Steuerberater abstimmen.`, L, 290)
    doc.setTextColor(0)
  }
  return doc.output('blob')
}
