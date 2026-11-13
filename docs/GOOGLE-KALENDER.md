# Google-Kalender einrichten

Einmalig, etwa 15 Minuten. Danach trägt die App Termine und Fristen in euren gemeinsamen Google-Kalender ein.
Die Client-ID ist nicht geheim. Sie wird in der App gespeichert (gemeinsame Konfiguration in OneDrive), nicht im Code.

## 1. Projekt in der Google Cloud anlegen

1. https://console.cloud.google.com öffnen und mit dem Google-Konto anmelden, dem der Kalender gehört.
2. Oben links auf die Projektauswahl → **Neues Projekt** → Name `Dokumentenmanager` → **Erstellen**.
   Das neue Projekt oben auswählen.
3. Menü → **APIs & Dienste → Bibliothek** → nach **Google Calendar API** suchen → **Aktivieren**.

## 2. Anmeldebildschirm (Google Auth Platform)

1. Menü → **Google Auth Platform** (früher „OAuth-Zustimmungsbildschirm“) → **Jetzt starten**.
2. App-Name `Dokumentenmanager`, Support-E-Mail = deine Adresse → **Weiter**.
3. Zielgruppe **Extern** → **Weiter**. Kontaktadresse = deine Adresse → **Weiter** → Richtlinie bestätigen → **Erstellen**.
4. Links **Zielgruppe** → unter **Testnutzer** → **Nutzer hinzufügen**: deine Gmail-Adresse und die von Daniela → **Speichern**.
   Der Status bleibt **Test**. Das ist gewollt, die App muss nicht von Google geprüft werden.
5. Links **Datenzugriff** → **Bereiche hinzufügen oder entfernen** → diese zwei anhaken (Suchfeld „calendar“) → **Aktualisieren** → **Speichern**:
   - `.../auth/calendar.events`
   - `.../auth/calendar.calendarlist.readonly`

## 3. Client-ID erstellen

1. Links **Clients** → **Client erstellen**.
2. Anwendungstyp **Webanwendung**, Name `Dokumentenmanager`.
3. **Autorisierte JavaScript-Quellen** → `https://mattment1980.github.io`
4. **Autorisierte Weiterleitungs-URIs** → `https://mattment1980.github.io/Dokumentenmanager/google-redirect.html`
   (beide Angaben stehen auch in der App unter Einstellungen → Google-Kalender → „Angaben für die Einrichtung bei Google“, mit Kopieren-Knopf)
5. **Erstellen** → die **Client-ID** (endet auf `.apps.googleusercontent.com`) kopieren. Ein Client-Schlüssel wird nicht gebraucht.

## 4. In der App verbinden

1. App → Einstellungen → **Google-Kalender** → Client-ID einfügen → **Client-ID speichern**.
2. **Mit Google verbinden** → Konto wählen. Google zeigt „Google hat diese App nicht überprüft“ → **Weiter**
   (das ist eure eigene App) → Häkchen beim Kalender-Zugriff setzen → **Weiter**.
3. Unter **Kalender** den bestehenden Kalender wählen. Die Wahl gilt für euch beide.
4. Optional: **Standard-Erinnerung** anpassen (vorgegeben: 3 Tage vorher).

## 5. Daniela

1. Im Google Kalender (Browser): beim gewählten Kalender **⋮ → Einstellungen und Freigabe → Für bestimmte Personen freigeben**
   → Danielas Adresse, Berechtigung **Änderungen an Terminen vornehmen**. (Entfällt, wenn schon geteilt.)
2. Daniela: App → Einstellungen → Google-Kalender → **Mit Google verbinden** mit ihrem eigenen Konto.

## Gut zu wissen

- Die Google-Anmeldung hält etwa eine Stunde. Danach öffnet die App beim nächsten Eintragen kurz ein kleines Fenster,
  das sich meist ohne Eingabe selbst wieder schließt.
- Klappt das Eintragen nicht (keine Verbindung, Anmeldung abgelaufen), bleibt der Termin auf dem Gerät vorgemerkt:
  Startseite → „Kalendereinträge offen“ → **Jetzt eintragen**. Doppelte Termine entstehen dabei nicht.
- Zugriff zurückziehen: in der App **Trennen**, oder unter https://myaccount.google.com/connections.
