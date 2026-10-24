/**
 * Bildschirm "home": Startseite mit Scannen, Dateiauswahl, Warteschlangen-Status und Verlauf.
 */
import { APP } from "../core/config.js";
import { S } from "../core/state.js";
import { registerScreen, isCurrent, render, setStack } from "../core/router.js";
import { app, $, esc, topbar } from "../core/ui.js";
import { I } from "../core/icons.js";
import { on } from "../core/events.js";
import { getHomeSections } from "../core/extensions.js";
import { processQueue } from "../core/uploader.js";
import { cancelBatch } from "../core/pipeline.js";
import { queue, history } from "../services/storage.js";
import * as od from "../services/onedrive.js";
import { describe } from "../documents/job.js";
import { openCamera, openFilePicker } from "../importers/sources.js";

registerScreen("home", {
  async render() {
    const [pending, hist] = await Promise.all([queue.all().catch(() => []), history.all().catch(() => [])]);
    if (!isCurrent("home")) return;
    const name = S.me?.givenName || S.account?.name?.split(" ")[0] || "";
    const open = S.batch ? describe(S.batch.jobs[S.batch.index]).title : S.mailImport ? S.mailImport.mail.subject || "E-Mail" : "";
    app.innerHTML = `${topbar(APP.name, { back: false, gear: true, sub: name ? `Hallo ${name}` : "" })}
      ${S.configMissing ? `<div class="banner err"><span class="grow">Im gewählten geteilten Ordner fehlt die Konfiguration. Bitte in den Einstellungen den richtigen Archivordner wählen.</span></div>` : ""}
      ${S.authProblem ? `<div class="banner warn"><span class="grow">${S.archive.mode === "shared" ? "Bitte die Anmeldung bzw. den Zugriff auf den geteilten Ordner erneuern." : "Die Anmeldung ist abgelaufen."}</span><button class="btn small" id="reauth">Neu anmelden</button></div>` : ""}
      ${open ? `<div class="banner info"><span class="grow">Noch in Bearbeitung: <b>${esc(open)}</b></span><button class="btn small" id="resume">Fortsetzen</button><button class="btn small" id="discard">Verwerfen</button></div>` : ""}
      ${pending.length ? `<div class="banner info"><span class="grow">${pending.length} Dokument${pending.length > 1 ? "e warten" : " wartet"} auf das Hochladen${navigator.onLine ? "" : " (offline)"}.${pending[0].lastError ? `<br><span class="small">${esc(pending[0].lastError)}</span>` : ""}</span>${navigator.onLine && !S.authProblem ? `<button class="btn small" id="retry">Jetzt</button>` : ""}</div>` : ""}
      <button class="hero" id="scan">${I.camera}<span>Dokument scannen</span></button>
      <button class="btn block" id="pick">${I.file} Datei oder E-Mail auswählen</button>
      <p class="muted small hint-desktop">Tipp: Anhänge oder ganze E-Mails aus Outlook einfach in dieses Fenster ziehen.</p>
      <p class="muted small hint-mobile">Tipp: In Gmail oder Outlook einen Anhang öffnen → Teilen → „Dokumente“.</p>
      <div id="homeExt">${getHomeSections().map((sec) => `<div data-home="${esc(sec.id)}">${sec.render()}</div>`).join("")}</div>
      <div class="card">
        <h2>Zuletzt abgelegt</h2>
        ${hist.length ? `<ul class="list">${hist.slice(0, 10).map((h) => `<li>
            <div class="fname">${esc(h.name)}</div>
            <div class="path">${esc(h.path)} · ${new Date(h.created).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</div>
            ${h.webUrl ? `<a class="small" href="${esc(h.webUrl)}" target="_blank" rel="noopener">In OneDrive öffnen</a>` : ""}
          </li>`).join("")}</ul>` : `<p class="muted">Noch nichts abgelegt. Leg los mit „Dokument scannen“.</p>`}
      </div>`;
    for (const sec of getHomeSections()) {
      const root = $(`[data-home="${sec.id}"]`);
      if (root && sec.bind) sec.bind(root);
    }
    $("#scan").onclick = () => openCamera();
    $("#pick").onclick = () => openFilePicker();
    $("#retry") && ($("#retry").onclick = () => processQueue());
    $("#reauth") && ($("#reauth").onclick = () => od.reauth());
    $("#resume") && ($("#resume").onclick = () => {
      if (S.mailImport) return setStack(["home", "mail"]);
      setStack(["home", S.job?.draft ? "review" : S.job?.needsPageReview ? "pages" : "route"]);
    });
    $("#discard") && ($("#discard").onclick = () => {
      S.mailImport = null;
      cancelBatch();
    });
  },
});

// Startseite aktualisieren, wenn sich die Warteschlange ändert (z. B. Upload fertig)
on("queue:changed", () => isCurrent("home") && render());
on("config:loaded", () => isCurrent("home") && render());
on("invoices:changed", () => isCurrent("home") && render());
