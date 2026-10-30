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
    extensions.js       Erweiterungspunkte für Funktionsmodule (siehe unten)
    features.js         Anmeldung und Schalter der Funktionsmodule (an/aus)
    sharedlist.js       gemeinsame, konfliktsichere Liste in OneDrive (für Funktionsmodule)
    archive.js          aktiver Archivordner (eigen / geteilt)
    structure.js        Ordnerstruktur laden, prüfen, speichern; Ergänzungen durch Module, Schalter speichern
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
    values.js           Beträge und Daten lesen und anzeigen
  importers/          Eingangskanäle
    index.js            zentrale Annahme: Dateien → Jobs
    mail.js             .eml und .msg einlesen
    sources.js          Kamera, Dateiauswahl, Hineinziehen, Teilen, „Öffnen mit“
  features/           Funktionsmodule, die nur über Erweiterungspunkte andocken
    invoices/           Rechnungen: Bezahlt-Frage, offene Liste, „Überwiesen“
      index.js            Anmeldung an den Erweiterungspunkten, Aktionen (markPaid …)
      register.js         gemeinsame Liste in OneDrive (_Offene-Rechnungen.json), konfliktsicher
      payment.js          IBAN-Prüfung, Fälligkeit (reine Funktionen)
    vouchers/           Gutscheine: eigener Hauptordner, offene Liste, Benutzt/Teilweise/Abgelaufen
      index.js            Anmeldung an den Erweiterungspunkten, Aktionen (retire, redeemPartly …)
      model.js            Konfiguration ergänzen, Gültigkeit, Sortierung (reine Funktionen)
    parcels/            Paketbenachrichtigungen: Box auf der Startseite, Zettel zeigen, Abgeholt = löschen
      index.js            Anmeldung, Vorschaubild beim Ablegen, Aktion pickedUp
      model.js            Fristen, Kartenlink (reine Funktionen)
  screens/            je Bildschirm eine Datei (registerScreen)

vendor/               fremde Bibliotheken, fest im Repository (siehe tools/vendor/README.md)
tests/                Unit-Tests (Node) und Browsertest (Playwright)
docs/                 diese Dokumentation
```

**Regeln für Abhängigkeiten** (von oben nach unten erlaubt, nie umgekehrt):

```
screens/   →  core/, features/  →  services/, documents/
features/  →  core/, services/, documents/   (nie umgekehrt: der Kern kennt keine Funktionsmodule)
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

## Erweiterungspunkte (`core/extensions.js`)

Funktionsmodule (`js/features/…`) melden sich hier an. Der Kern ruft sie an festen Stellen auf, ohne sie
zu kennen. So bleibt jedes Modul in sich geschlossen und lässt sich ab- oder umbauen.

| Punkt | Wann | Beispiel Rechnungen |
|-------|------|---------------------|
| `registerDraftInit(fn)` | neuer Entwurf | `draft.payment = {…}` anlegen |
| `registerAiField({name, schema, rule, apply})` | KI-Anfrage / -Antwort | Feld `zahlung` (IBAN, Betrag …) |
| `registerReviewSection({id, applies, render, bind, validate})` | Prüfen-Bildschirm | „Bezahlt?“ mit Zahlungsdaten |
| `registerSaveFilter(fn(plan))` | vor dem Ablegen | Zielordner, `_bezahlt`, Vermerk, `plan.meta` |
| `registerHomeSection({id, render, bind})` | Startseite | Kachel „Offene Rechnungen“ |
| `registerSavePrepare(async fn(plan))` | beim Ablegen, vor dem Hochladen (asynchron) | Pakete: Bild des Zettels in `plan.meta` |

Ein Prüfen-Abschnitt kann mit `target(job, draft)` den Ablageort festlegen (z. B. Gutscheine → `15_Gutscheine`,
Pakete → `00_Eingang/Paketbenachrichtigungen`). Der Prüfen-Bildschirm zeigt dann statt der Ordnerwahl den festen Ort
(mit `targetNote`), und die Ordnerwahl ist keine Pflicht mehr.

`plan.meta` wird mit der Datei in die Warteschlange gelegt und nach dem erfolgreichen Upload im Ereignis
`queue:uploaded` zurückgegeben – so funktioniert die Nachbearbeitung auch, wenn erst später hochgeladen wird.

## Funktionsmodule an- und abschalten (`core/features.js`)

Jedes Modul meldet sich mit `registerFeature({ id, label, description })` an und kennzeichnet seine Erweiterungen
mit `feature: "<id>"` (bei Funktionen: `registerSaveFilter(fn, { feature })`). Der Schalter steht in der
gemeinsamen Konfiguration (`features: { vouchers: false, … }`, fehlend = an) und gilt für alle Nutzer des Archivs.
Abgeschaltet heißt: KI-Felder, Prüfen-Abschnitte, Ablage-Filter und Startseiten-Bausteine des Moduls werden
übersprungen, seine Dokumenttypen (`doctype.feature`) sind nicht wählbar und gehen nicht an die KI. Daten und
Listen in OneDrive bleiben erhalten. Bedienung: Einstellungen → „Funktionen“.

Braucht ein Modul Dokumenttypen oder Ordner, ergänzt es sie selbst beim Ereignis `config:loaded` über
`extendStructure()` (liest die aktuelle Konfiguration, schreibt konfliktsicher, nacheinander). Die Teile tragen
`feature: "<id>"`, damit sie auch nach Umbenennen erkannt werden. Wer den Typ „Gutschein“ loswerden will, schaltet
das Modul ab – bei eingeschaltetem Modul wird er sonst wieder ergänzt.

## Gemeinsame Listen

| Datei im Archivordner | Modul | Inhalt |
|-----------------------|-------|--------|
| `_Offene-Rechnungen.json` | invoices | offene Rechnungen, bekannte IBANs je Empfänger |
| `_Gutscheine.json` | vouchers | offene Gutscheine (Händler, Betrag, Code, PIN, Ablauf, Verlauf „teilweise“) |
| `_Paketbenachrichtigungen.json` | parcels | offene Abholzettel samt Vorschaubild (JPEG, ≤ 450 KB) |

Gutscheine und Pakete nutzen `core/sharedlist.js` (gleiches Verfahren wie die Rechnungsliste: lesen mit
Versionskennung, schreiben nur bei unveränderter Datei, sonst neuer Versuch). Nach jeder Änderung kommen die
Ereignisse `<modul>:changed` und `home:changed`.

## Erweitern – wo gehört was hin?

| Vorhaben                                   | Ort |
|--------------------------------------------|-----|
| Neuer Eingangskanal (z. B. Postfach abrufen) | neue Quelle in `importers/sources.js` oder eigenes Modul in `importers/`, ruft `importFiles()` bzw. `startBatch()` auf |
| Neues Dateiformat                          | `documents/filetypes.js` (+ ggf. Zweig in `importers/index.js`, Manifest pflegen) |
| Neue Funktion rund ums Ablegen (Fristen, Kalender …) | neues Modul in `features/<name>/`, nutzt Erweiterungspunkte und Ereignisse; in `js/app.js` importieren – Vorbild `features/invoices/` |
| Neuer externer Dienst (z. B. Kalender-API)  | neues Modul in `services/` (ohne Oberfläche) |
| Neuer Bildschirm                           | Datei in `screens/` mit `registerScreen()`, in `js/app.js` importieren, in `sw.js` (SHELL) eintragen |
| Neues Feld im Prüfen-Bildschirm            | `job.draft` in `core/pipeline.js` (newDraft, validate) und `screens/review.js` |

### Ereignisse (`core/events.js`)

| Ereignis          | Daten | Wann |
|-------------------|-------|------|
| `document:saved`  | `{ job, draft, result, archive, rel }` | nach dem Ablegen eines Dokuments (auch wenn es noch in der Warteschlange wartet) |
| `queue:uploaded`  | `{ item, result }` | eine Datei ist tatsächlich in OneDrive (`item.meta` aus dem Ablageplan, `result.id`) |
| `queue:changed`   | –     | Warteschlange verändert (Upload fertig, Fehler …) |
| `config:loaded`   | Struktur | Ordnerstruktur geladen oder gespeichert |
| `invoices:changed`| Register | Liste der offenen Rechnungen geändert |
| `vouchers:changed`, `parcels:changed` | Liste | Gutschein- bzw. Paketliste geändert |
| `home:changed`    | –     | etwas auf der Startseite hat sich geändert (Listen der Module) |

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
