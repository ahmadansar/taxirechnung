// Rechtstexte (deutsche Fassung ist maßgeblich). Platzhalter {{key}} werden aus OPERATOR befüllt.
// Hinweis: Mustertexte – vor dem kommerziellen Einsatz von Anwalt/Steuerberater prüfen lassen.
import { LEGAL_UPDATED, OPERATOR, TERMS_VERSION } from './operator'

export type LegalDoc = 'impressum' | 'datenschutz' | 'agb' | 'avv'
export interface Block {
  h?: string
  p?: string[]
  list?: string[]
}

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  impressum: 'Impressum',
  datenschutz: 'Datenschutzerklärung',
  agb: 'Allgemeine Geschäftsbedingungen (Nutzungsbedingungen)',
  avv: 'Vertrag zur Auftragsverarbeitung (AVV) nach Art. 28 DSGVO',
}

const OP = `{{name}}, {{street}}, {{zipCity}}`

const SUBPROCESSORS = [
  'Supabase, Inc. – Datenbank, Anmeldung, Dateiablage (Archiv) und Server-Funktionen. Serverstandort: London, Vereinigtes Königreich (Angemessenheitsbeschluss der EU-Kommission). Grundlage: Auftragsverarbeitungsvertrag (DPA) von Supabase mit EU-Standardvertragsklauseln für etwaige Zugriffe aus Drittländern.',
  'GoDaddy.com, LLC, 2155 E. GoDaddy Way, Tempe, AZ 85284, USA – Webhosting der App-Dateien (Webserver-Protokolle). Grundlage: Data Processing Addendum von GoDaddy; GoDaddy ist unter dem EU-US Data Privacy Framework zertifiziert (Angemessenheitsbeschluss, Art. 45 DSGVO).',
]

const impressum: Block[] = [
  { h: 'Angaben gemäß § 5 DDG', p: ['{{name}}', 'Rechtsform: {{legalForm}}', '{{street}}', '{{zipCity}}', '{{country}}'] },
  { h: 'Vertreten durch', p: ['Die vertretungsberechtigten Gesellschafter {{representatives}}'] },
  { h: 'Kontakt', p: ['E-Mail: {{email}}', 'Telefon: {{phone}}', 'Website: {{website}}'] },
  {
    h: 'Umsatzsteuer',
    p: [OPERATOR.vatId ? 'Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {{vatId}}' : OPERATOR.smallBusiness ? 'Kleinunternehmer gemäß § 19 UStG – es wird keine Umsatzsteuer ausgewiesen.' : 'Eine Umsatzsteuer-Identifikationsnummer ist nicht vorhanden.'],
  },
  { h: 'Genehmigung und Aufsichtsbehörde', p: ['{{permit}}'] },
  { h: 'Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV', p: ['{{contentResponsible}}'] },
  {
    h: 'Verbraucherstreitbeilegung',
    p: ['Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Das Angebot richtet sich ausschließlich an Unternehmer.'],
  },
  {
    h: 'Haftung für Inhalte',
    p: [
      'Die Inhalte dieser App wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte, insbesondere der steuerlichen Hinweise, wird keine Gewähr übernommen. Die App ersetzt keine Steuer- oder Rechtsberatung.',
      'Für Rechnungen und Kundendaten, die Nutzer in der App erfassen, ist das jeweilige Taxiunternehmen verantwortlich.',
    ],
  },
]

const datenschutz: Block[] = [
  { p: [`Stand: ${LEGAL_UPDATED}`] },
  {
    h: '1. Verantwortlicher',
    p: [`Verantwortlich für die Datenverarbeitung auf dieser Website und für Ihr Nutzerkonto ist: ${OP}, vertreten durch die Gesellschafter {{representatives}}, E-Mail: {{email}}, Telefon: {{phone}}.`],
  },
  {
    h: '2. Zwei Rollen: Konto-Daten und Kundendaten der Taxiunternehmen',
    p: [
      'Für die Daten Ihres Nutzerkontos und Ihres Unternehmens (z. B. E-Mail-Adresse, Firmenangaben) sind wir Verantwortlicher im Sinne der DSGVO.',
      'Die Daten der Fahrgäste und Kunden, die ein Taxiunternehmen in der App speichert (Namen, Adressen, Fahrten, Rechnungen), verarbeiten wir ausschließlich im Auftrag und nach Weisung des jeweiligen Taxiunternehmens (Auftragsverarbeitung nach Art. 28 DSGVO, siehe AVV). Verantwortlicher für diese Daten ist das Taxiunternehmen. Fahrgäste wenden sich mit Anfragen bitte direkt an das Taxiunternehmen, das ihnen die Rechnung ausgestellt hat.',
    ],
  },
  {
    h: '3. Aufruf der App (Webhosting)',
    p: [
      'Beim Aufruf der App speichert der Webserver unseres Hosters automatisch technische Zugriffsdaten (IP-Adresse, Datum und Uhrzeit, aufgerufene Datei, Browser-Typ, Betriebssystem). Diese Daten sind für die sichere Auslieferung der App erforderlich und werden nach spätestens 30 Tagen gelöscht, sofern sie nicht zur Aufklärung eines Sicherheitsvorfalls benötigt werden.',
      'Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren, stabilen Betrieb).',
    ],
  },
  {
    h: '4. Nutzerkonto und Nutzung der App',
    p: [
      'Für die Registrierung verarbeiten wir Ihre E-Mail-Adresse und ein Passwort (nur verschlüsselt als Hash gespeichert). Bei der Einrichtung erfassen Sie Ihre Unternehmensdaten (Firmenname, Inhaber, Anschrift, Kontakt, Steuernummer/USt-IdNr., Bankverbindung), die für Pflichtangaben auf Rechnungen nach § 14 UStG benötigt werden.',
      'Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag über die Nutzung der App). Zur Absicherung speichert unser Datenbankanbieter Anmeldeprotokolle (Zeitpunkt, IP-Adresse) – Art. 6 Abs. 1 lit. f DSGVO.',
    ],
  },
  {
    h: '5. Speicherung im Browser (kein Tracking)',
    p: [
      'Die App speichert im lokalen Speicher Ihres Geräts (localStorage) nur, was für den Betrieb unbedingt erforderlich ist: Ihre Anmeldesitzung, die gewählte Sprache und zwischengespeicherte App-Dateien für die Offline-Nutzung. Dies ist nach § 25 Abs. 2 Nr. 2 TDDDG ohne Einwilligung zulässig.',
      'Wir verwenden keine Analyse-, Werbe- oder Tracking-Dienste, keine Cookies zu Marketingzwecken und laden keine Schriftarten oder Skripte von Drittanbietern nach.',
    ],
  },
  {
    h: '6. Zahlungsseite für Fahrgäste',
    p: [
      'Über den Link oder QR-Code auf einer Rechnung können Fahrgäste eine Seite mit den Überweisungsdaten aufrufen. Dabei werden nur die Daten dieser einen Rechnung (Rechnungsnummer, Betrag, Bankverbindung des Taxiunternehmens) aus der Datenbank geladen. Die Zahlung erfolgt per Überweisung direkt an das Taxiunternehmen; wir erhalten keine Zahlungsdaten.',
    ],
  },
  {
    h: '7. Automatischer Zahlungsabgleich (optional)',
    p: [
      'Nur wenn ein Taxiunternehmen den automatischen Bankabgleich aktiviert, werden dessen Online-Banking-Zugangsdaten mit AES-256-GCM verschlüsselt gespeichert und die Kontoumsätze über die FinTS-Schnittstelle direkt bei der Bank abgerufen, um bezahlte Rechnungen zu erkennen. Kontoumsätze werden dabei nicht dauerhaft gespeichert, gespeichert wird nur der Zahlungsstatus der Rechnung. Die Verbindung kann jederzeit getrennt werden; die Zugangsdaten werden dann gelöscht.',
      'Beim manuellen Import von Kontoauszügen (CSV/CAMT) wird die Datei ausschließlich im Browser ausgewertet und nicht hochgeladen.',
    ],
  },
  { h: '8. Empfänger und Auftragsverarbeiter', list: SUBPROCESSORS },
  {
    h: '9. Speicherdauer',
    p: [
      'Konto- und Unternehmensdaten speichern wir für die Dauer des Nutzungsvertrags. Nach Vertragsende stellen wir dem Unternehmen seine Daten zum Export bereit und löschen sie nach 30 Tagen, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.',
      'Rechnungen unterliegen beim Taxiunternehmen der gesetzlichen Aufbewahrungspflicht von 8 Jahren (§ 14b UStG, § 147 AO). Für deren Aufbewahrung nach Vertragsende ist das Taxiunternehmen selbst verantwortlich (Datensicherung als ZIP in der App).',
    ],
  },
  {
    h: '10. Ihre Rechte',
    p: [
      'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO). Wenden Sie sich dazu an {{email}}.',
      'Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. bei: {{supervisoryAuthority}}.',
    ],
  },
  {
    h: '11. Pflicht zur Bereitstellung, keine automatisierten Entscheidungen',
    p: [
      'Die Angabe von E-Mail-Adresse und Unternehmensdaten ist für die Nutzung der App erforderlich. Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art. 22 DSGVO) findet nicht statt.',
    ],
  },
  { h: '12. Sicherheit', p: ['Alle Verbindungen sind per TLS (HTTPS) verschlüsselt. Die Daten jedes Unternehmens sind in der Datenbank durch Zugriffsregeln (Row Level Security) von anderen Unternehmen getrennt.'] },
]

const agb: Block[] = [
  { p: [`Version ${TERMS_VERSION} · Stand: ${LEGAL_UPDATED}`, `Anbieter: ${OP}, E-Mail: {{email}} (nachfolgend „Anbieter“).`] },
  {
    h: '§ 1 Geltungsbereich',
    p: [
      'Diese Bedingungen gelten für die Nutzung der Web-App „TaxiRechnung“ (nachfolgend „App“) durch Unternehmer im Sinne von § 14 BGB (nachfolgend „Kunde“). Das Angebot richtet sich nicht an Verbraucher.',
      'Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich in Textform zustimmt.',
    ],
  },
  {
    h: '§ 2 Vertragsgegenstand',
    p: [
      'Der Anbieter stellt dem Kunden die App als Software-as-a-Service über das Internet zur Verfügung. Die App unterstützt insbesondere beim Erstellen, Versenden, Archivieren und Verwalten von Rechnungen und Kundendaten, beim Erzeugen von E-Rechnungen im Format XRechnung sowie beim Abgleich von Zahlungseingängen.',
      'Der Anbieter schuldet die Bereitstellung der Software, nicht einen bestimmten wirtschaftlichen oder steuerlichen Erfolg. Die App ersetzt keine Steuerberatung und keine Buchhaltungssoftware.',
    ],
  },
  {
    h: '§ 3 Registrierung und Zugang',
    p: [
      'Der Vertrag kommt mit der Registrierung und der Bestätigung dieser Bedingungen zustande. Der Kunde muss wahrheitsgemäße Angaben machen und seine Zugangsdaten geheim halten. Er haftet für Handlungen, die über sein Konto vorgenommen werden, soweit er dies zu vertreten hat.',
    ],
  },
  {
    h: '§ 4 Verfügbarkeit und Weiterentwicklung',
    p: [
      'Der Anbieter bemüht sich um eine möglichst unterbrechungsfreie Verfügbarkeit. Eine bestimmte Verfügbarkeit wird nicht zugesichert. Wartungsarbeiten, Störungen bei Dienstleistern (Hosting, Datenbank, Banken) oder höhere Gewalt können zu Unterbrechungen führen.',
      'Der Anbieter darf die App weiterentwickeln und anpassen, insbesondere an geänderte gesetzliche Anforderungen, sofern die wesentlichen Funktionen erhalten bleiben.',
    ],
  },
  {
    h: '§ 5 Pflichten des Kunden',
    list: [
      'Der Kunde ist für die Richtigkeit seiner Unternehmensdaten (Steuernummer/USt-IdNr., Steuersätze, Kleinunternehmerstatus) und für den Inhalt jeder Rechnung selbst verantwortlich und prüft Rechnungen vor dem Versand.',
      'Der Kunde ist gegenüber seinen Fahrgästen Verantwortlicher im Sinne der DSGVO für die von ihm erfassten personenbezogenen Daten.',
      'Der Kunde erfüllt seine gesetzlichen Aufbewahrungspflichten (§ 147 AO, § 14b UStG, GoBD) eigenverantwortlich. Die App unterstützt ihn durch ein unveränderbares Archiv und eine Datensicherung als ZIP-Datei; der Kunde soll regelmäßig – mindestens monatlich – eine Datensicherung herunterladen und eine Verfahrensdokumentation führen (Vorlage in der App).',
      'Der Kunde darf die App nicht missbräuchlich nutzen, insbesondere keine rechtswidrigen Inhalte speichern und keine Sicherheitsmechanismen umgehen.',
    ],
  },
  {
    h: '§ 6 Vergütung',
    p: [
      'Die Höhe der Vergütung richtet sich nach der bei Vertragsschluss vereinbarten Preisvereinbarung bzw. dem in der App oder auf der Rechnung des Anbieters ausgewiesenen Preis. Ist keine Vergütung vereinbart, ist die Nutzung unentgeltlich.',
      'Rechnungen des Anbieters sind innerhalb von 14 Tagen ohne Abzug fällig. Preisänderungen kündigt der Anbieter mit einer Frist von 6 Wochen in Textform an; der Kunde kann in diesem Fall zum Zeitpunkt des Wirksamwerdens kündigen.',
    ],
  },
  {
    h: '§ 7 Laufzeit, Kündigung, Datenrückgabe',
    p: [
      'Der Vertrag läuft auf unbestimmte Zeit und kann von beiden Seiten mit einer Frist von 14 Tagen zum Monatsende in Textform gekündigt werden. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
      'Der Kunde kann seine Daten jederzeit, auch nach der Kündigung bis zum Vertragsende, vollständig exportieren (Rechnungen als PDF und XRechnung, Kundendaten, CSV/JSON). Nach Vertragsende hält der Anbieter die Daten noch 30 Tage zum Export bereit und löscht sie anschließend, soweit keine gesetzliche Pflicht zur Aufbewahrung beim Anbieter besteht.',
    ],
  },
  {
    h: '§ 8 Haftung',
    p: [
      'Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz sowie im Umfang einer übernommenen Garantie.',
      'Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (Kardinalpflicht), deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen darf, ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen.',
      'Für Datenverluste haftet der Anbieter nur in Höhe des Aufwands, der bei regelmäßiger Datensicherung durch den Kunden (§ 5) zur Wiederherstellung erforderlich gewesen wäre.',
      'Bei unentgeltlicher Nutzung haftet der Anbieter nur für Vorsatz und grobe Fahrlässigkeit sowie in den Fällen des Absatzes 1.',
      'Die verschuldensunabhängige Haftung für bei Vertragsschluss vorhandene Mängel (§ 536a Abs. 1 Alt. 1 BGB) ist ausgeschlossen.',
    ],
  },
  {
    h: '§ 9 Datenschutz',
    p: [
      'Soweit der Anbieter personenbezogene Daten im Auftrag des Kunden verarbeitet, gilt der Vertrag zur Auftragsverarbeitung (AVV), der mit Annahme dieser Bedingungen geschlossen wird und Bestandteil dieses Vertrags ist. Im Übrigen gilt die Datenschutzerklärung.',
    ],
  },
  {
    h: '§ 10 Änderungen dieser Bedingungen',
    p: [
      'Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern, wenn dies aus rechtlichen oder technischen Gründen erforderlich ist und den Kunden nicht unangemessen benachteiligt. Änderungen werden mindestens 6 Wochen vor Inkrafttreten in der App angekündigt. Der Kunde muss den neuen Bedingungen in der App zustimmen, um die App weiter zu nutzen; stimmt er nicht zu, kann er zum Zeitpunkt des Inkrafttretens kündigen.',
    ],
  },
  {
    h: '§ 11 Schlussbestimmungen',
    p: [
      'Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Ist der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand der Sitz des Anbieters.',
      'Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.',
    ],
  },
]

const avv: Block[] = [
  {
    p: [
      `Version ${TERMS_VERSION} · Stand: ${LEGAL_UPDATED}`,
      'zwischen dem Kunden (Taxiunternehmen, nachfolgend „Verantwortlicher“) und',
      `${OP} (nachfolgend „Auftragsverarbeiter“).`,
      'Dieser Vertrag wird mit der Zustimmung in der App geschlossen (elektronisches Format nach Art. 28 Abs. 9 DSGVO).',
    ],
  },
  {
    h: '1. Gegenstand und Dauer',
    p: [
      'Der Auftragsverarbeiter verarbeitet personenbezogene Daten im Auftrag des Verantwortlichen im Rahmen der Bereitstellung der App „TaxiRechnung“ gemäß den Nutzungsbedingungen. Die Dauer entspricht der Laufzeit des Nutzungsvertrags.',
    ],
  },
  {
    h: '2. Art und Zweck der Verarbeitung',
    p: ['Speicherung, Anzeige, Übermittlung (PDF/E-Mail/Teilen auf Veranlassung des Verantwortlichen), Archivierung und Löschung von Daten zur Erstellung und Verwaltung von Rechnungen sowie zum Abgleich von Zahlungseingängen.'],
  },
  {
    h: '3. Art der Daten',
    list: [
      'Kundenstammdaten: Name, Firma, Anschrift, E-Mail, Telefon, Kundennummer/Notizen',
      'Rechnungs- und Fahrtdaten: Fahrtdatum, Start/Ziel, Strecke, Leistungen, Beträge, Steuersätze, Zahlungsart und -status',
      'Bei aktiviertem Bankabgleich: verschlüsselte Online-Banking-Zugangsdaten des Verantwortlichen; Kontoumsätze werden nur flüchtig zum Abgleich verarbeitet',
      'Nutzerdaten des Verantwortlichen: E-Mail-Adresse, Anmeldeprotokolle',
    ],
  },
  { h: '4. Kategorien betroffener Personen', list: ['Fahrgäste und Kunden des Verantwortlichen', 'Ansprechpartner von Firmenkunden', 'Nutzer und Beschäftigte des Verantwortlichen'] },
  {
    h: '5. Pflichten des Auftragsverarbeiters',
    list: [
      'Verarbeitung nur auf dokumentierte Weisung des Verantwortlichen; als Weisung gelten die Nutzungsbedingungen und die Bedienung der App. Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, informiert er den Verantwortlichen unverzüglich.',
      'Personen mit Zugang zu den Daten sind zur Vertraulichkeit verpflichtet.',
      'Umsetzung der technischen und organisatorischen Maßnahmen nach Art. 32 DSGVO (Ziffer 7).',
      'Unterstützung des Verantwortlichen bei Anfragen betroffener Personen (Art. 12–23 DSGVO), insbesondere durch Export- und Löschfunktionen in der App.',
      'Unterstützung bei den Pflichten aus Art. 32–36 DSGVO; Meldung von Verletzungen des Schutzes personenbezogener Daten unverzüglich, möglichst innerhalb von 24 Stunden nach Kenntnis.',
      'Nach Vertragsende: Rückgabe durch Exportmöglichkeit und Löschung aller Daten nach 30 Tagen, sofern keine gesetzliche Speicherpflicht besteht.',
      'Bereitstellung aller zum Nachweis erforderlichen Informationen und Ermöglichung von Überprüfungen nach vorheriger Ankündigung mit angemessener Frist.',
    ],
  },
  {
    h: '6. Unterauftragsverarbeiter',
    p: ['Der Verantwortliche genehmigt die folgenden Unterauftragsverarbeiter. Über beabsichtigte Änderungen informiert der Auftragsverarbeiter mindestens 4 Wochen vorher in der App oder per E-Mail; der Verantwortliche kann aus wichtigem datenschutzrechtlichem Grund widersprechen und den Vertrag kündigen.'],
    list: SUBPROCESSORS,
  },
  {
    h: '7. Technische und organisatorische Maßnahmen (Art. 32 DSGVO)',
    list: [
      'Verschlüsselung: alle Verbindungen per TLS (HTTPS); Speicherung beim Datenbankanbieter verschlüsselt (Encryption at Rest); Bank-Zugangsdaten zusätzlich mit AES-256-GCM verschlüsselt, Schlüssel getrennt von der Datenbank.',
      'Zugriffskontrolle: Anmeldung mit E-Mail und Passwort (mind. 8 Zeichen); Mandantentrennung durch Row Level Security – jedes Unternehmen sieht ausschließlich eigene Daten; Rollen Inhaber/Fahrer – Fahrer erhalten Zugang nur über einen einmaligen, 7 Tage gültigen Einladungscode des Inhabers und haben keinen Zugriff auf Firmeneinstellungen, Bankverbindung und Datensicherung.',
      'Integrität: ausgestellte Rechnungen sind in der Datenbank gegen Änderung gesperrt (GoBD); Korrektur nur per Stornorechnung; archivierte PDF/XML-Dateien können nicht überschrieben oder gelöscht werden.',
      'Verfügbarkeit: Betrieb in professionellen Rechenzentren; Datensicherung durch den Datenbankanbieter sowie Export-Funktion für den Verantwortlichen.',
      'Datensparsamkeit: keine Tracking- oder Analysedienste; Kontoumsätze werden nicht dauerhaft gespeichert.',
      'Organisation: Zugriff auf Produktivdaten durch den Auftragsverarbeiter nur, soweit für Support oder Fehlerbehebung erforderlich.',
    ],
  },
  {
    h: '8. Haftung und Schlussbestimmungen',
    p: ['Für die Haftung gilt Art. 82 DSGVO; im Übrigen gelten die Nutzungsbedingungen. Bei Widersprüchen geht dieser Vertrag den Nutzungsbedingungen in Datenschutzfragen vor.'],
  },
]

export const LEGAL_DOCS: Record<LegalDoc, Block[]> = { impressum, datenschutz, agb, avv }

/** Replace {{key}} with operator values; returns parts so missing values can be highlighted. */
export function fillParts(text: string): { text: string; missing?: boolean }[] {
  const parts: { text: string; missing?: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) })
    const v = String((OPERATOR as Record<string, unknown>)[m[1]] ?? '')
    parts.push(v ? { text: v } : { text: `[${m[1]} – bitte ergänzen]`, missing: true })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
export const fill = (text: string) => fillParts(text).map((p) => p.text).join('')
