# Dokumentenmanager

Private Web-App zum Ablegen von Post und E-Mail-Anhängen im OneDrive-Archiv (`OneDrive/11_Dokumentenarchiv`).
Optimiert für Chrome auf Android, nutzbar auch am Desktop.

**Adresse:** https://mattment1980.github.io/Dokumentenmanager/

## Was die App kann

**Briefe scannen:** Seiten fotografieren → Ecken werden erkannt (korrigierbar) → PDF entsteht auf dem Gerät.

**E-Mails ablegen**
- *Handy:* Anhang in Gmail/Outlook öffnen → **Teilen → „Dokumente“**
- *Desktop:* Anhang oder **ganze E-Mail** aus Outlook ins App-Fenster ziehen
  (bei GMX: Mail als .eml speichern und hineinziehen oder über „Datei oder E-Mail auswählen“)
- Mehrere Anhänge werden einzeln geprüft und abgelegt; der **Mailtext** wird als letzte Seite angehängt
  (pro Dokument abschaltbar). Mails ohne Anhang werden selbst zum Dokument.
- Word/Excel-Anhänge werden im Original abgelegt.

**Rechnungen**
- Bei Rechnungen und Mahnungen: „Bezahlt?“ → *Bezahlt* / *Wird abgebucht* (Ablage mit Vermerk) oder
  *Offen* (Ablage in `00_Eingang/Unbezahlte Rechnungen` und in die Liste)
- Liste **Offene Rechnungen** mit Empfänger, IBAN, Betrag, Verwendungszweck, Fälligkeit und Kopieren-Knöpfen
- **Überwiesen** verschiebt die Rechnung mit dem Vermerk „bezahlt“ in ihren Ordner
- IBAN-Prüfung und Warnung bei geänderter Bankverbindung eines Empfängers

**Gutscheine**
- Eigener Hauptordner (fortlaufend nummeriert, z. B. `15_Gutscheine`), wird bei Bedarf automatisch angelegt
- Liste **Offene Gutscheine**: Händler, Wofür, Betrag, Code und PIN zum Kopieren, Ablaufdatum
  (sortiert, hervorgehoben ab 30 Tagen vor Ablauf)
- **Benutzt** bzw. **Abgelaufen** verschiebt nach `Verbraucht`, **Teilweise** speichert den Restbetrag

**Paketbenachrichtigungen**
- Box **Pakete abholen** auf der Startseite (nur, wenn etwas offen ist): Dienstleister, Abholort, Frist, Für wen
- Antippen zeigt den Zettel bildschirmfüllend (Barcode zum Vorzeigen), Abholort mit Kartenlink, Code zum Kopieren
- **Abgeholt** löscht den Zettel (landet im OneDrive-Papierkorb)

Rechnungen, Gutscheine und Pakete lassen sich unter Einstellungen → **Funktionen** einzeln abschalten
(gilt für alle Nutzer des Archivs; Dateien und Listen bleiben erhalten).

**Ablegen**
1. **KI-Vorschlag** (Ordner, Typ, Absender, Titel, Briefdatum) oder **Direkt ablegen** (ohne KI)
2. Auf einem Bildschirm prüfen und bestätigen
3. Ablage in OneDrive als `JJJJ-MM-TT_Absender_Dokumenttyp_Titel.pdf`

Ohne Internet wartet das Dokument auf dem Gerät und wird hochgeladen, sobald die App wieder online geöffnet ist.

## Einrichtung

### 1. GitHub Pages einschalten (einmalig)
Repository → **Settings → Pages** → „Build and deployment“: Source **Deploy from a branch**, Branch **main**, Ordner **/ (root)** → Save.
Nach 1–2 Minuten ist die App unter der Adresse oben erreichbar.

### 2. Microsoft-App registrieren (einmalig, ca. 10 Minuten)
1. https://entra.microsoft.com öffnen und mit dem **privaten Microsoft-Konto** anmelden. Falls verlangt, einmalig ein kostenloses Verzeichnis anlegen lassen.
2. **App-Registrierungen → Neue Registrierung**
   - Name: `Dokumentenmanager`
   - Unterstützte Kontotypen: **Nur persönliche Microsoft-Konten**
   - Umleitungs-URI: Plattform **Single-Page-Anwendung (SPA)**, Adresse:
     `https://mattment1980.github.io/Dokumentenmanager/redirect.html`
     (die exakte Adresse zeigt die App auch beim ersten Start an)
3. **Registrieren** → auf der Übersichtsseite die **Anwendungs-ID (Client-ID)** kopieren
4. **API-Berechtigungen**: `User.Read` ist vorhanden. Über „Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen“ zusätzlich **Files.ReadWrite** hinzufügen.
5. Die Client-ID beim ersten Start der App eintragen.

### 3. KI-Schlüssel
Unter https://console.anthropic.com einen API-Schlüssel erstellen und Ausgabenlimit setzen.
In der App unter **Einstellungen → KI** eintragen und „Testen“ tippen. Der Schlüssel bleibt nur auf dem Gerät.

### 4. Installieren
- **Handy:** Adresse in Chrome öffnen → Menü (⋮) → **App installieren**. Erst danach erscheint „Dokumente“ im Teilen-Menü.
- **Desktop (optional):** In Chrome/Edge das Installieren-Symbol in der Adressleiste. Dann gibt es „Öffnen mit → Dokumentenmanager“ für PDFs und Mails.

## Gemeinsame Nutzung (weitere Personen)

1. **Besitzer:** In OneDrive den Archivordner (z. B. `11_Dokumentenarchiv`) mit der Microsoft-Adresse der anderen Person teilen, Berechtigung **„Kann bearbeiten“**.
2. **Mitbenutzer:** Einladungsmail öffnen, App aufrufen, mit dem **eigenen** Microsoft-Konto anmelden.
3. **Einstellungen → Archivordner → Geteilter Ordner** → „Zugriff erlauben“ (einmalige Microsoft-Bestätigung für geteilte Dateien) → Archiv auswählen.
   Taucht der Ordner nicht auf: den Freigabelink aus der Einladungsmail einfügen.
4. Eigenen API-Schlüssel eintragen (am besten ein eigener Schlüssel pro Gerät in der Console des Besitzers).

Mitbenutzer verwenden Struktur und KI-Regeln aus dem geteilten Ordner. „Abgelegt von“ trägt automatisch ihren Namen.
An der Microsoft-App-Registrierung muss dafür nichts geändert werden.

## Anpassen

Ordner, Unterordner, KI-Regeln und Dokumenttypen werden in der App unter **Einstellungen** bearbeitet und als
`_Dokumentenmanager-Konfiguration.json` im Archivordner gespeichert. Neue Ordner legt die App selbst an;
umbenannte oder gelöschte Ordner bleiben in OneDrive bestehen und werden dort von Hand angepasst.

## Datenschutz

- Dokumente gehen nur an OneDrive und, nur im KI-Weg, zur Auswertung an Anthropic.
- API-Schlüssel und Anmeldung werden nur lokal im Browser gespeichert. Im Code stehen keine Geheimnisse.
- Fremdbibliotheken liegen fest im Ordner `vendor/` (MSAL, pdf-lib, postal-mime, msgreader), nichts wird von fremden Servern geladen.
- Die App hat keinen Zugriff auf E-Mail-Postfächer; Mails kommen nur durch Teilen, Hineinziehen oder Auswählen hinein.

## Für Entwickler

Reines HTML/CSS/JavaScript ohne Build-Schritt.

- Aufbau, Datenfluss und „wo gehört was hin“: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)
- Sicherheitsmodell und Regeln für Erweiterungen: [docs/SICHERHEIT.md](docs/SICHERHEIT.md)
- Änderungen: [CHANGELOG.md](CHANGELOG.md) · Fremdbibliotheken: [tools/vendor/README.md](tools/vendor/README.md)

**Tests**
```bash
npm test                     # Unit-Tests (Node 20+), ohne Abhängigkeiten
python3 tests/e2e/run.py     # Browsertest mit nachgebildetem OneDrive und KI (Playwright + Chromium)
```
