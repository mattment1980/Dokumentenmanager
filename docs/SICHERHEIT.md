# Sicherheit und Datenschutz

## Grundprinzipien

1. **Kein eigener Server.** Die App ist eine statische Webseite. Dokumente gehen direkt vom Gerät zu
   OneDrive (Microsoft) und – nur im KI-Weg – zu Anthropic. Es gibt keinen Zwischenserver.
2. **Keine Geheimnisse im Code.** Das Repository ist öffentlich. Die Microsoft-Client-ID ist kein Geheimnis.
   API-Schlüssel und Anmeldedaten liegen nur lokal im Browser des jeweiligen Geräts.
3. **Keine persönlichen Daten im Code.** Die echte Ordnerstruktur (Namen, Orte …) liegt nur in OneDrive;
   im Code steht eine neutrale Vorlage.
4. **Mensch bestätigt immer.** Die KI macht nur Vorschläge in einem festen Schema; abgelegt wird erst nach
   Bestätigung.

## Wer kommt an was?

| Wer                         | sieht / kann                                                       |
|-----------------------------|--------------------------------------------------------------------|
| Jeder mit der App-Adresse   | die leere App; ohne eigenes Microsoft-Konto nichts. Mit eigenem Konto nur das eigene OneDrive |
| Angemeldete Person          | ihr eigenes OneDrive bzw. den mit ihr geteilten Archivordner        |
| Anthropic                   | nur Dokumente, die im KI-Weg geschickt werden (kein Training, Löschung nach 30 Tagen laut API-Bedingungen) |
| GitHub                      | nur den Programmcode                                               |

## Berechtigungen bei Microsoft

- `User.Read` – Vorname für „Abgelegt von“
- `Files.ReadWrite` – eigenes OneDrive (die App nutzt nur den Archivordner)
- `Files.ReadWrite.All` – **nur** bei Nutzung eines geteilten Ordners, wird erst dann abgefragt

Die App hat **keinen Zugriff auf E-Mail-Postfächer oder Kalender**. E-Mails kommen nur in die App, wenn
jemand sie aktiv teilt, hineinzieht oder auswählt.

## Technische Schutzmaßnahmen

- **Content-Security-Policy** (in `index.html` und `redirect.html`): Skripte nur von der eigenen Adresse,
  Verbindungen nur zu Microsoft und Anthropic, keine eingebetteten fremden Seiten.
- **Fremdbibliotheken liegen im Repository** (`vendor/`), nicht auf fremden Servern. Keine nutzt `eval`.
  Herkunft und Versionen: `tools/vendor/README.md`.
- **Maskierung**: Alles aus Dokumenten, E-Mails, KI-Antworten und OneDrive wird vor der Anzeige mit
  `esc()` maskiert (`js/core/ui.js`).
- **E-Mail-HTML wird nie ausgeführt**: HTML-Mails werden mit `DOMParser` in Text umgewandelt; dabei laufen
  keine Skripte und es werden keine Bilder oder Links geladen. Abgelegt wird nur der Text.
- **Schutz gegen versteckte Anweisungen** in Dokumenten (Prompt Injection): Die Systemanweisung der KI
  behandelt Dokumentinhalte als Daten; das Antwortschema erlaubt nur bekannte Ordner und Typen
  (`normalize()` in `services/ai.js`); der Mensch bestätigt.
- **Digital signierte PDFs** werden nie verändert (sonst wäre die Signatur ungültig).
- **Geteilte Dateien (Android)** landen nur im lokalen Zwischenspeicher des Geräts und werden nach dem
  Übernehmen gelöscht.

## Zahlungsdaten (Rechnungsmodul)

- Die App **überweist nie selbst** und hat keinen Zugang zu Bankkonten. Sie zeigt nur Daten zum Abtippen/Kopieren.
- IBAN, Betrag, Empfänger und Verwendungszweck offener Rechnungen liegen in `_Offene-Rechnungen.json` im
  Archivordner – also dort, wo die Rechnungen selbst liegen, mit denselben Zugriffsrechten.
- **IBAN-Prüfziffer**: Lese- und Tippfehler der KI werden erkannt, eine ungültige IBAN blockiert das Ablegen als „offen“.
- **Betrugsschutz**: Für jeden Empfänger merkt sich die App die bisher genutzten IBANs. Taucht eine neue auf,
  erscheint eine deutliche Warnung (beim Ablegen und in der Liste). Gefälschte Rechnungen mit geänderter
  Bankverbindung sind eine verbreitete Masche.
- Gleichzeitige Änderungen zweier Geräte an der Liste werden über die Versionskennung von OneDrive erkannt
  (kein stilles Überschreiben).

## Gutscheine und Pakete

- Gutscheincodes, PINs, Abholcodes und Abholadressen liegen in `_Gutscheine.json` bzw.
  `_Paketbenachrichtigungen.json` im Archivordner – mit denselben Zugriffsrechten wie die Dokumente selbst –
  und als Kopie für die Anzeige ohne Netz im lokalen Speicher des Geräts.
- Paketeinträge enthalten ein Bild des Zettels (für den Barcode an der Theke). Es wird mit „Abgeholt“ zusammen
  mit der Datei entfernt.
- „Abgeholt“ löscht über Microsoft Graph; bei privaten Konten landet die Datei im Papierkorb, nichts wird
  endgültig gelöscht.
- Der Kartenlink öffnet Google Maps mit dem Abholort – erst auf ausdrücklichen Tipp, nie automatisch.

## Regeln für Erweiterungen

- Keine Schlüssel, Passwörter oder persönlichen Daten in den Code oder in Testdateien.
- Neue externe Verbindungen nur nach bewusster Entscheidung – und dann in die CSP (`connect-src`) eintragen.
- Keine Skripte von CDNs oder fremden Servern; neue Bibliotheken nach `vendor/` und dokumentieren.
- Inhalte aus Dokumenten/E-Mails/KI nie ungeprüft in HTML einsetzen (`esc()` verwenden).
- Neue Microsoft-Berechtigungen nur, wenn nötig, und erst bei Bedarf abfragen (wie bei geteilten Ordnern).
- Ein vollautomatischer Weg ohne menschliche Bestätigung braucht eine eigene Risikobetrachtung.

## Empfehlungen für die Nutzer

- Zwei-Faktor-Anmeldung bei Microsoft, GitHub und Anthropic.
- Pro Gerät einen eigenen Anthropic-Schlüssel mit Ausgabenlimit; bei Verlust einzeln sperren.
- Bildschirmsperre am Handy.
