/**
 * Bildschirm "login": Anmeldung mit dem Microsoft-Konto.
 */
import { APP } from "../core/config.js";
import { S } from "../core/state.js";
import { registerScreen } from "../core/router.js";
import { app, $, esc, topbar, toast, errText } from "../core/ui.js";
import { archiveLong } from "../core/archive.js";
import * as od from "../services/onedrive.js";

registerScreen("login", {
  render() {
    app.innerHTML = `${topbar(APP.name, { back: false, gear: true })}
      <div class="center">
        <img src="icons/icon-192.png" alt="" width="96" height="96" style="border-radius:22px">
        <div><h2 style="margin:0 0 6px">Willkommen</h2>
        <p class="muted">Melde dich mit deinem Microsoft-Konto an. Die Dokumente werden im Archiv ${esc(archiveLong())} abgelegt.</p></div>
        ${S.setupError ? `<div class="banner err">${esc(S.setupError)}</div>` : ""}
        <button class="btn primary block" id="login">Mit Microsoft anmelden</button>
      </div>`;
    $("#login").onclick = async () => {
      try {
        await od.login();
      } catch (e) {
        toast("Anmeldung fehlgeschlagen: " + errText(e), 6000);
      }
    };
  },
});
