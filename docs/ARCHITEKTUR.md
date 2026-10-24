# Architektur

Der Dokumentenmanager ist eine reine Web-App (HTML, CSS, JavaScript-Module) **ohne Build-Schritt** und
**ohne eigenen Server**. Er läuft im Browser, spricht direkt mit Microsoft (Anmeldung, OneDrive) und
Anthropic (KI-Vorschlag) und wird über GitHub Pages ausgeliefert.

## Ordnerstruktur

```
index.html            Seitengerüst, Sicherheitsrichtlinie (CSP), lädt js/app.js
redirect.html/.js     Rücksprungseite der Microsoft-Anmeldung
sw.js                 Service Worker: Offline-Start und Teilen-Ziel (Android)
manifest.webmanifest  App-Installation, Teilen-Menü, „Öffnen mit“
styles.css            Gestaltung (helles und dunkles Farbschema über CSS-Variablen)

js/
  app.js              Einstieg: Bildschirme laden, Service Worker, Anmeldung, Start
  core/               App-Logik mit Zustand und Oberflächen-Helfern
    config.js           Grundeinstellungen, neutrale Vorlage der Ordnerstruktur
    state.js            Laufzeit-Zustand S (ein einfaches Objekt)
    router.js           Bildschirm-Navigation, Zurück-Taste
    ui.js / icons.js    Helfer (esc, toast, busy, topbar …) und Symbole
    events.js           Ereignis-Bus für Erweiterungen
    archive.js          aktiver Archivordner (eigen / geteilt)
    structure.js        Ordnerstruktur laden, prüfen, speichern
    uploader.js         Upload-Warteschlange (offline-fest)
    pipeline.js         zentraler Ablauf: Stapel → Weg → Prüfen → Ablegen
  services/           Anbindungen nach außen – ohne Oberfläche, ohne App-Zustand
    onedrive.js         Microsoft-Anmeldung (MSAL) und OneDrive (Graph)
    ai.js               KI-Vorschlag (Anthropic API)
    storage.js          lokaler Speicher (Einstellungen, Warteschlange, Verlauf)
  documents/          Dokument-Verarbeitung – ohne Oberfläche
    job.js              Modell „Dokument-Auftrag“ und Erzeugung der Ablagedatei
    pdf.js              PDF erzeugen, Mailtext-Seite anhängen (pdf-lib)
    scan.js             Fotos: Kanten erkennen, entzerren, Kontrast
    naming.js           Dateinamen-Schema
    filetypes.js        welche Dateitypen wie verarbeitet werden
  importers/          Eingangskanäle
    index.js            zentrale Annahme: Dateien → Jobs
    mail.js             .eml und .msg einlesen
    sources.js          Kamera, Dateiauswahl, Hineinziehen, Teilen, „Öffnen mit“
  screens/            je Bildschirm eine Datei (registerScreen)

vendor/               fremde Bibliotheken, fest im Repository (siehe tools/vendor/README.md)
tests/                Unit-Tests (Node) und Browsertest (Playwright)
docs/                 diese Dokumentation
```

**Regeln für Abhängigkeiten** (von oben nach unten erlaubt, nie umgekehrt):

```
screens/  →  core/  →  services/, documents/
importers/ →  core/, documents/
services/, documents/  →  nur untereinander und core/config.js
```

`services/` und `documents/` kennen weder Oberfläche noch App-Zustand. Dadurch lassen sie sich in Node
testen und in anderen Zusammenhängen wiederverwenden.

## Datenfluss

```
 Kamera ─┐
 Datei ──┤                        ┌─ pages (nur Fotos) ─┐
 Ziehen ─┼─▶ importers/index.js ─▶│                     ├─▶ route ─▶ review ─▶ saveCurrent()
 Teilen ─┤    (Dateien → Jobs)    └─ (E-Mail: mail) ────┘   KI/      prüfen     │
 Öffnen ─┘          │                                       direkt              ▼
                    └──── startBatch(jobs) ──────────────────────────▶  buildFinal → Warteschlange
                                                                          → OneDrive → "document:saved"
                                                                          → nächster Job / done
```

### Der Dokument-Auftrag („Job“)

Alles, was abgelegt wird, ist ein Job (`documents/job.js`):

| kind       | Inhalt                  | Ablage als                         | Mailtext anhängbar |
|------------|-------------------------|------------------------------------|--------------------|
| `scan`     | Seitenbilder            | PDF                                | ja                 |
| `pdf`      | vorhandenes PDF         | PDF (Original, falls nichts angehängt wird) | ja, außer digital signiert |
| `mailtext` | Text einer E-Mail       | PDF                                | – (ist der Mailtext) |
| `file`     | Word, Excel …           | Original                           | nein               |

Ein Job trägt optional die E-Mail, aus der er stammt (`job.mail`), und den Entwurf der Ablagedaten
(`job.draft`: Datum, Typ, Ordner, Absender, Titel, KI-Vorschlag).

Mehrere Jobs bilden einen **Stapel** (`S.batch`), z. B. alle Anhänge einer Mail. Sie werden nacheinander
geprüft und abgelegt; einzelne lassen sich überspringen.

### Konfiguration

Ordnerstruktur und Dokumenttypen liegen als `_Dokumentenmanager-Konfiguration.json` im Archivordner in
OneDrive. Das Gerät hält nur eine Kopie für den Offline-Betrieb. Im Code steht nur eine neutrale Vorlage.

## Erweitern – wo gehört was hin?

| Vorhaben                                   | Ort |
|--------------------------------------------|-----|
| Neuer Eingangskanal (z. B. Postfach abrufen) | neue Quelle in `importers/sources.js` oder eigenes Modul in `importers/`, ruft `importFiles()` bzw. `startBatch()` auf |
| Neues Dateiformat                          | `documents/filetypes.js` (+ ggf. Zweig in `importers/index.js`, Manifest pflegen) |
| Etwas nach dem Ablegen tun (Fristen, Kalender) | eigenes Modul, das `on("document:saved", …)` abonniert – siehe unten |
| Neuer externer Dienst (z. B. Kalender-API)  | neues Modul in `services/` (ohne Oberfläche) |
| Neuer Bildschirm                           | Datei in `screens/` mit `registerScreen()`, in `js/app.js` importieren, in `sw.js` (SHELL) eintragen |
| Neues Feld im Prüfen-Bildschirm            | `job.draft` in `core/pipeline.js` (newDraft, validate) und `screens/review.js` |

### Ereignisse (`core/events.js`)

| Ereignis          | Daten | Wann |
|-------------------|-------|------|
| `document:saved`  | `{ job, draft, result, archive, rel }` | nach dem Ablegen eines Dokuments (auch wenn es noch in der Warteschlange wartet) |
| `queue:changed`   | –     | Warteschlange verändert (Upload fertig, Fehler …) |
| `config:loaded`   | Struktur | Ordnerstruktur geladen oder gespeichert |

Beispiel für eine spätere Fristen-Erweiterung:

```js
import { on } from "../core/events.js";
on("document:saved", ({ job, draft }) => {
  if (draft.doctype === "Bescheid") { /* Widerspruchsfrist vorschlagen … */ }
});
```

## Pflege-Checkliste bei jeder Änderung

1. `APP.version` in `js/core/config.js` erhöhen **und** `CACHE` in `sw.js` anpassen.
2. Neue Dateien in `SHELL` in `sw.js` eintragen.
3. `CHANGELOG.md` ergänzen.
4. Tests laufen lassen: `npm test` und `python3 tests/e2e/run.py`.
5. Sicherheitsregeln in `docs/SICHERHEIT.md` beachten.
