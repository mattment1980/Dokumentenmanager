# Dokumentenmanager

Private Web-App zum Scannen von Post und Ablegen im OneDrive-Archiv (`OneDrive/11_Dokumentenarchiv`).
Optimiert für Chrome auf Android.

**Adresse:** https://mattment1980.github.io/Dokumentenmanager/

## Ablauf

1. Seiten fotografieren (eine oder mehrere), Ecken werden automatisch erkannt und lassen sich korrigieren
2. Die App erstellt das PDF lokal auf dem Handy
3. **KI-Vorschlag** (Ordner, Typ, Absender, Titel, Briefdatum) oder **Direkt ablegen** (ohne KI)
4. Auf einem Bildschirm prüfen und bestätigen
5. Ablage in OneDrive als `JJJJ-MM-TT_Absender_Dokumenttyp_Titel.pdf`

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

### 4. Auf dem Handy installieren
Adresse in Chrome öffnen → Menü (⋮) → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.

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
- Einzige Fremdbibliothek: die offizielle Microsoft-Anmeldebibliothek (MSAL, im Ordner `vendor/`).

## Technik

Reines HTML/CSS/JavaScript ohne Build-Schritt. `js/config.js` enthält die Standardstruktur und optional die feste Client-ID.
