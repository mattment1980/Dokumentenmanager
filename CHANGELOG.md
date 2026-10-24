# Änderungen

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
