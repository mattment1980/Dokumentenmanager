/**
 * Bildschirm "setup": Microsoft-Client-ID eintragen (nur nötig, wenn sie nicht fest in
 * core/config.js steht).
 */
import { S } from "../core/state.js";
import { registerScreen } from "../core/router.js";
import { app, $, esc, topbar, toast, copyText } from "../core/ui.js";
import { settings } from "../services/storage.js";
import * as od from "../services/onedrive.js";

registerScreen("setup", {
  render() {
    app.innerHTML = `${topbar("Einrichtung", { back: false })}
      <div class="card stack">
        <h2>Verbindung zu Microsoft</h2>
        <p class="muted">Für die Anmeldung braucht die App die <b>Anwendungs-ID (Client-ID)</b> aus deiner Microsoft-App-Registrierung. Dort als Umleitungs-URI (Typ „Single-Page-Anwendung“) genau diese Adresse eintragen:</p>
        <code class="copy">${esc(od.redirectUri())}</code>
        <button class="btn small" id="copyRu">Adresse kopieren</button>
        <label class="field"><span>Anwendungs-ID (Client-ID)</span>
          <input type="text" id="cid" placeholder="z. B. 1a2b3c4d-…" value="${esc(S.clientId)}" autocomplete="off" spellcheck="false"></label>
        <button class="btn primary block" id="saveCid">Speichern und weiter</button>
      </div>`;
    $("#copyRu").onclick = () => copyText(od.redirectUri());
    $("#saveCid").onclick = () => {
      const v = $("#cid").value.trim();
      if (!/^[0-9a-f-]{32,40}$/i.test(v)) return toast("Das sieht nicht wie eine Client-ID aus.");
      settings.set("clientId", v);
      location.reload();
    };
  },
});
