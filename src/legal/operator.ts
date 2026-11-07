// Angaben zum Betreiber der App (Anbieter im Sinne von § 5 DDG).
// ⚠️ Vor dem Verkauf an weitere Taxiunternehmen hier die echten Daten eintragen
// und neu bauen (npm run build). Leere Felder werden im Impressum rot markiert.
export const OPERATOR = {
  name: 'Ahmed & Sumbul GbR (Altbacher Taxi)', // Firmenname wie im Impressum von altbachertaxi.de
  legalForm: 'Gesellschaft bürgerlichen Rechts (GbR)',
  representatives: 'Baria Sumbul und Irfan Ahmed', // vertretungsberechtigte Gesellschafter
  street: 'Wilhelmstraße 33',
  zipCity: '73776 Altbach',
  country: 'Deutschland',
  email: 'altbachertaxi@gmail.com',
  phone: '0176 82239961',
  vatId: 'DE356716314', // USt-IdNr., falls vorhanden – sonst leer lassen
  smallBusiness: false, // Kleinunternehmer nach § 19 UStG?
  website: 'https://rechnung.altbachertaxi.de',
  contentResponsible: 'Irfan Ahmed, Ahmed & Sumbul GbR, Wilhelmstraße 33, 73776 Altbach',
  permit: 'Genehmigung für den Verkehr mit Taxen nach § 47 PBefG; Genehmigungs- und Aufsichtsbehörde: Landratsamt Esslingen, Straßenverkehrsamt, 73728 Esslingen am Neckar',
  supervisoryAuthority:
    'Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg, Lautenschlagerstraße 20, 70173 Stuttgart, www.baden-wuerttemberg.datenschutz.de',
}

/** Bump when AGB / AVV change materially → all users must accept again. */
export const TERMS_VERSION = '2026-11'
export const LEGAL_UPDATED = '02.11.2026'

export const operatorComplete = () => !!(OPERATOR.name && OPERATOR.street && OPERATOR.zipCity && OPERATOR.email)
