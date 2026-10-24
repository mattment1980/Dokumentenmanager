/**
 * Grundeinstellungen der App (öffentlich einsehbar – hier keine Geheimnisse oder persönlichen Daten!).
 *
 * version     – bei jeder Änderung erhöhen; muss zu CACHE in sw.js passen (Test prüft das)
 * CLIENT_ID   – "Anwendungs-ID (Client-ID)" der Microsoft-App-Registrierung (nicht geheim).
 *               Bleibt sie leer, kann sie in der App eingetragen werden.
 * DEFAULT_STRUCTURE – neutrale Vorlage; die echte Struktur liegt nur in OneDrive.
 */
export const APP = {
  name: "Dokumentenmanager",
  version: "2.0.0",
  CLIENT_ID: "092c210e-11a4-40b9-bea0-68f165ee0b73",
  // Exakt so in Entra als Umleitungs-URI (Typ Single-Page-Anwendung) eingetragen.
  // Wird verwendet, wenn die App unter dieser Domain läuft (unabhängig von Groß-/Kleinschreibung im Pfad).
  APP_BASE: "https://mattment1980.github.io/Dokumentenmanager/",
  authority: "https://login.microsoftonline.com/consumers",
  scopes: ["User.Read", "Files.ReadWrite"],
  defaultArchiveRoot: "11_Dokumentenarchiv",
  configFileName: "_Dokumentenmanager-Konfiguration.json",
  models: [
    { id: "claude-sonnet-5-5", label: "Sonnet 5.5 (genauer, empfohlen)" },
    { id: "claude-haiku-5-5", label: "Haiku 5.5 (schneller, günstiger)" },
  ],
  defaultModel: "claude-sonnet-5-5",
  inboxFolder: "00_Eingang",
};

const people = (names) => names.map((n) => ({ name: n }));
const PERSONS = ["Person 1", "Person 2"];

// Neutrale Vorlage ohne persönliche Angaben (dieser Code ist öffentlich einsehbar).
// Sie wird nur verwendet, wenn im Archivordner noch keine Konfigurationsdatei liegt.
// Die eigentliche, persönliche Struktur liegt ausschließlich in OneDrive und wird in der App bearbeitet.
export const DEFAULT_STRUCTURE = {
  version: 1,
  folders: [
    {
      name: "00_Eingang",
      description: "Auffangordner: nur verwenden, wenn das Dokument eindeutig nirgends passt oder unlesbar ist.",
      children: [],
    },
    {
      name: "01_Banken & Konten",
      description: "Girokonten, Depots, Sparkonten, Kreditkarten, Kredite: Kontoauszüge, Depotabrechnungen, Konditionsänderungen. Unterordner nach Kontoinhaber.",
      children: people([...PERSONS, "Gemeinsam"]),
    },
    {
      name: "02_Altersvorsorge",
      description: "Lebensversicherungen, Rentenversicherungen, Renteninformation der Deutschen Rentenversicherung, betriebliche Altersvorsorge.",
      children: people(PERSONS),
    },
    {
      name: "03_Versicherungen",
      description: "Alle Versicherungen außer Kranken- und Altersvorsorge, auch die Wohngebäudeversicherung der Immobilien und die Kfz-Versicherung. Unterordner nach Sparte.",
      children: [
        { name: "Haftpflicht" },
        { name: "Hausrat" },
        { name: "Wohngebäude" },
        { name: "Kfz" },
        { name: "Rechtsschutz" },
        { name: "Unfall & Berufsunfähigkeit" },
        { name: "Sonstige" },
      ],
    },
    {
      name: "04_Krankenversicherung",
      description: "Alles, was von der Krankenkasse oder Krankenversicherung kommt oder dorthin geht: Beitragsbescheide, Leistungsabrechnungen, Erstattungen, Mitgliedsbescheinigungen. Dokumente direkt vom Arzt gehören NICHT hierher, sondern zu 05_Gesundheit.",
      children: [
        { name: "Person 1" },
        { name: "Person 2" },
      ],
    },
    {
      name: "05_Gesundheit",
      description: "Alles direkt von Ärzten, Kliniken, Apotheken, Laboren: Arztrechnungen, Befunde, Arztbriefe, Impfpässe, Rezepte. Unterordner nach Patient.",
      children: people(PERSONS),
    },
    {
      name: "06_Steuern",
      description: "Einkommensteuer: Steuerbescheide, Steuererklärungen, Vorauszahlungen, Steuer-ID, Lohnsteuerbescheinigungen, Belege für das Finanzamt. Gemeinsame Veranlagung unter Gemeinsam.",
      children: [
        { name: "Gemeinsam", description: "Zusammenveranlagung" },
        { name: "Person 1" },
        { name: "Person 2" },
      ],
    },
    {
      name: "07_Ämter & Persönliches",
      description: "Urkunden, Ausweiskopien, Meldebescheinigungen, Rundfunkbeitrag, sonstiger Schriftverkehr mit Behörden, der nicht zu Steuern, Immobilien oder Fahrzeugen gehört.",
      children: people([...PERSONS, "Gemeinsam"]),
    },
    {
      name: "08_Beruf",
      description: "Gehaltsabrechnungen, Arbeitsverträge, Sozialversicherungsmeldungen, Arbeitszeugnisse, Weiterbildung.",
      children: people(PERSONS),
    },
    {
      name: "09_Immobilien",
      description: "Alles rund um die Immobilien, je Objekt: Kauf, Grundbuch, Grundsteuer, Handwerker, Nebenkosten, Strom, Gas, Wasser, Hausverwaltung.",
      children: [{ name: "Hauptwohnsitz" }],
    },
    {
      name: "10_Fahrzeuge",
      description: "Kaufvertrag, Zulassung, Kfz-Steuer, Werkstatt, TÜV, Leasing oder Finanzierung. Die Kfz-Versicherung gehört zu 03_Versicherungen.",
      children: [],
    },
    {
      name: "11_Verträge & Abos",
      description: "Laufende Verträge ohne eigenen Ordner: Handy, Internet, Streaming, Zeitschriften, Fitnessstudio, Mitgliedschaften der Erwachsenen.",
      children: [
        { name: "Telefon & Internet" },
        { name: "Medien & Abos" },
        { name: "Mitgliedschaften" },
        { name: "Sonstige" },
      ],
    },
    {
      name: "12_Kinder",
      description: "Schule, Kita, Vereine, Freizeit, Zeugnisse, Urkunden und Zertifikate der Kinder. Gesundheit der Kinder gehört zu 05_Gesundheit.",
      children: [],
    },
    {
      name: "13_Anschaffungen & Garantien",
      description: "Kaufbelege und Garantien für Geräte, Möbel, Elektronik: alles, wofür später ein Kaufnachweis gebraucht wird.",
      children: [],
    },
  ],
  doctypes: [
    { name: "Rechnung", short: "Rechnung", hint: "Zahlungsaufforderung für Ware oder Leistung" },
    { name: "Mahnung", short: "Mahnung", hint: "Zahlungserinnerung oder Mahnung" },
    { name: "Abrechnung", short: "Abrechnung", hint: "Nebenkosten, Gehalt, Beiträge, Kontoauszug, Erstattung" },
    { name: "Vertrag", short: "Vertrag", hint: "Vertrag, Vertragsänderung, Kündigung, Kündigungsbestätigung" },
    { name: "Bescheid", short: "Bescheid", hint: "Behördliche Entscheidung (Steuer, Beitrag, Rente)" },
    { name: "Bescheinigung", short: "Bescheinigung", hint: "Nachweis, Bestätigung, Zeugnis, Urkunde" },
    { name: "Kaufbeleg/Garantie", short: "Kaufbeleg", hint: "Kassenbon, Kaufbeleg, Garantieschein" },
    { name: "Antrag/Formular", short: "Antrag", hint: "Muss ausgefüllt oder zurückgeschickt werden" },
    { name: "Termin/Einladung", short: "Termin", hint: "Elternabend, Arzttermin, Versammlung" },
    { name: "Information/Sonstiges", short: "Info", hint: "Alles andere" },
  ],
};
