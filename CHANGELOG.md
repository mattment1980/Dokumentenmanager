# Änderungen

## 2.3.0 – Rabatte, Paketzettel besser erkannt

**Neu**
- Rabattaktionen: Dokumenttyp heißt jetzt „Gutschein/Rabatt“; im Prüfen-Bildschirm Auswahl *Gutschein | Rabatt*
  - Rabatt: Höhe (z. B. „20 %“), Worauf, Händler, Code, Gültig bis, Einlösung; Dateiname `…_Rabatt_…`
  - In der Liste mit Etikett „Rabatt“, ohne „Teilweise“, nicht in der Euro-Summe
  - Liste und Kachel heißen „Gutscheine & Rabatte“; mehrfach nutzbare Codes bleiben einfach stehen
- Paketbenachrichtigungen
  - KI ordnet jede Benachrichtigungskarte eines Paketdienstes als Paketbenachrichtigung ein (nicht angetroffen,
    Filiale/Packstation, beim Nachbarn, neuer Zustellversuch)
  - Zettel ohne Abholort: Box zeigt „neuer Zustellversuch (am …)“, Knopf „Erledigt“
  - Box auf der Startseite heißt „Pakete“

**Korrekturen**
- Scheitert das automatische Ergänzen von Dokumenttypen/Ordnern in OneDrive, erscheint ein Hinweis; beim
  nächsten Start wird es erneut versucht (bisher still)
- Unverändert übernommene Typen aus 2.2 („Gutschein“, „Paketbenachrichtigung“) werden auf die neue Beschreibung
  gebracht; selbst angepasste Typen bleiben unberührt

## 2.2.0 – Gutscheine, Paketbenachrichtigungen, Funktionsschalter

**Neu**
- Gutscheine
  - Neuer Dokumenttyp „Gutschein“ und eigener Hauptordner (nächste freie Nummer, z. B. `15_Gutscheine`) mit
    Unterordner `Verbraucht` – beides wird beim ersten Start automatisch in der Konfiguration ergänzt
  - KI liest Händler, Wofür, Betrag, Code, PIN, Ablaufdatum und Einlöseweg (online/vor Ort) aus
  - Liste „Offene Gutscheine“ (Kachel auf der Startseite): sortiert nach Ablauf, Hervorhebung ab 30 Tagen vorher,
    Code/PIN kopieren; „Benutzt“ und „Abgelaufen“ verschieben nach `Verbraucht`; „Teilweise“ speichert den Restbetrag
- Paketbenachrichtigungen
  - Neuer Dokumenttyp „Paketbenachrichtigung“, Ablage in `00_Eingang/Paketbenachrichtigungen`
  - KI liest Dienstleister, Abholort und Adresse, Zustellversuch, Abholfrist (auch „7 Werktage“), Code und Empfänger
  - Box „Pakete abholen“ auf der Startseite, nur wenn etwas offen ist; knappe Fristen rot
  - Detail: Zettel bildschirmfüllend zum Vorzeigen, Kartenlink, Code kopieren; „Abgeholt“ löscht (Papierkorb)
- Einstellungen → „Funktionen“: Rechnungen, Gutscheine und Pakete einzeln an-/abschalten, gemeinsam für alle
  Nutzer des Archivs (in der Konfiguration in OneDrive)

**Intern**
- `core/features.js`: Anmeldung und Schalter der Funktionsmodule; Erweiterungen mit `feature` werden bei
  abgeschaltetem Modul übersprungen, Dokumenttypen eines abgeschalteten Moduls ausgeblendet
- Neue Erweiterungspunkte: fester Ablageort aus einem Prüfen-Abschnitt (`target`), asynchrone Ablage-Vorbereitung
  (`registerSavePrepare`)
- `core/sharedlist.js`: allgemeine, konfliktsichere Liste in OneDrive; `core/structure.js → extendStructure()`
  zum Ergänzen der Konfiguration durch Module
- `documents/values.js`: Beträge und Daten (aus dem Rechnungsmodul herausgelöst)
- OneDrive-Dienst: Datei löschen (`deleteItem`, Papierkorb)

## 2.1.0 – Rechnungen

**Neu**
- Bei Rechnungen und Mahnungen fragt die App „Bezahlt?“ – *Bezahlt*, *Offen* oder *Wird abgebucht*
  - Bezahlt: Ablage im Zielordner, Dateiname mit `_bezahlt`, Vermerk in den Eigenschaften
  - Wird abgebucht: Ablage im Zielordner, Dateiname mit `_Lastschrift`
  - Offen: Ablage in `00_Eingang/Unbezahlte Rechnungen` und Eintrag in die Liste
- KI liest Empfänger, IBAN, Betrag, Verwendungszweck und Fälligkeit aus (auch „zahlbar in 14 Tagen“)
- Liste „Offene Rechnungen“ (Kachel auf der Startseite): sortiert nach Fälligkeit, Summe, Überfälliges markiert,
  Kopieren-Knöpfe; „Überwiesen“ verschiebt die Rechnung in ihren Ordner und benennt sie in `…_bezahlt` um
- Gemeinsame Liste für alle Nutzer des Archivs (konfliktsicher)
- IBAN-Prüfziffer und Warnung bei geänderter IBAN eines bekannten Empfängers
- Mahnung: Hinweis, wenn beim selben Empfänger schon eine Rechnung offen ist

**Intern**
- Erweiterungspunkte für Funktionsmodule (`core/extensions.js`), erstes Modul `features/invoices/`
- OneDrive-Dienst: Verschieben/Umbenennen, konfliktsicheres Schreiben, explizites Archiv je Aufruf
- Ereignis `queue:uploaded` mit Zusatzdaten aus dem Ablageplan

## 2.0.0 – E-Mails ablegen, neue Code-Struktur

**Neu**
- E-Mail-Anhänge ablegen
  - Handy: Anhang in Gmail/Outlook öffnen → Teilen → „Dokumente“
  - Desktop: Anhang oder ganze Mail aus Outlook (classic und neu) ins Fenster ziehen; .eml/.msg auch über
    „Datei oder E-Mail auswählen“ und, bei installierter App, über „Öffnen mit“
- Mehrere Anhänge einer Mail werden einzeln geprüft und abgelegt (Auswahl, „Dokument 2 von 3“, Überspringen)
- Mailtext als letzte Seite (Von, An, Datum, Betreff, Text) – standardmäßig an, pro Dokument abschaltbar
- Mail ohne Anhang: Mailtext wird selbst zum Dokument
- KI bekommt den Mailtext als Kontext; ohne Datum im Dokument gilt das Datum der Mail
- Word-, Excel- und andere Office-Dateien werden im Original abgelegt
- Digital signierte PDFs bleiben unverändert

**Intern**
- Code in Module aufgeteilt (core, services, documents, importers, screens), dokumentiert in `docs/ARCHITEKTUR.md`
- Gemeinsamer Ablauf für alle Eingangskanäle (`core/pipeline.js`), Ereignisse für Erweiterungen
- PDF-Erzeugung mit pdf-lib; E-Mail-Import mit postal-mime (.eml) und msgreader (.msg)
- Automatische Tests im Repository (`npm test`, `tests/e2e/run.py`)
- Sicherheitsmodell dokumentiert in `docs/SICHERHEIT.md`

## 1.2.1
- Geteilte Ordner: robuster gegenüber abweichenden Microsoft-Antworten

## 1.2.0
- Gemeinsame Nutzung über einen geteilten OneDrive-Ordner

## 1.1.0
- Persönliche Angaben aus dem öffentlichen Code entfernt, Content-Security-Policy

## 1.0.x
- Erste Version: Scannen, KI-Vorschlag, Ablage in OneDrive, Struktur bearbeiten, Offline-Warteschlange
