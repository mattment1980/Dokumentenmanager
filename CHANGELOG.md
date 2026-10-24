# Änderungen

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
