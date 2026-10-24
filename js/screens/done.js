/**
 * Bildschirm "done": Ergebnis des abgeschlossenen Stapels (ein oder mehrere Dokumente).
 */
import { S } from "../core/state.js";
import { registerScreen, resetTo } from "../core/router.js";
import { app, $, esc, topbar } from "../core/ui.js";
import { I } from "../core/icons.js";
import { openCamera } from "../importers/sources.js";

registerScreen("done", {
  render() {
    const results = S.lastResults || [];
    const saved = results.filter((r) => !r.skipped);
    const queued = saved.filter((r) => r.queued);
    const skipped = results.filter((r) => r.skipped);
    const auth = saved.some((r) => r.authProblem);
    const allUp = saved.length && !queued.length;
    const title = !saved.length ? "Nichts abgelegt" : allUp ? (saved.length > 1 ? `${saved.length} Dokumente abgelegt` : "Abgelegt") : "Gespeichert, wird hochgeladen";
    const text = !saved.length
      ? "Alle Dokumente wurden übersprungen."
      : allUp
        ? "Die Dokumente liegen jetzt in OneDrive."
        : auth
          ? "Bitte neu anmelden, dann wird hochgeladen."
          : "Sobald wieder Internet da ist und die App geöffnet ist, wird automatisch hochgeladen.";
    app.innerHTML = `${topbar("Fertig", { back: false })}
      <div class="center" style="padding-bottom:16px">
        <span class="ic big ${allUp ? "ok" : ""}">${allUp ? I.check : I.upload}</span>
        <div><h2 style="margin:0 0 6px">${esc(title)}</h2><p class="muted">${esc(text)}</p></div>
      </div>
      <div class="card"><ul class="list">
        ${saved.map((r) => `<li>
          <div class="fname">${esc(r.fileName)}</div>
          <div class="path">${esc(r.path)}${r.queued ? " · wartet auf Upload" : ""}</div>
          ${r.note ? `<div class="path" style="color:var(--warn)">${esc(r.note)}</div>` : ""}
          ${r.webUrl ? `<a class="small" href="${esc(r.webUrl)}" target="_blank" rel="noopener">In OneDrive öffnen</a>` : ""}
        </li>`).join("")}
        ${skipped.map((r) => `<li><div class="fname muted">${esc(r.title)}</div><div class="path">übersprungen</div></li>`).join("")}
      </ul></div>
      <button class="btn primary block" id="again">${I.camera} Nächstes Dokument scannen</button>
      <div style="height:8px"></div>
      <button class="btn block" data-act="home">Zur Startseite</button>`;
    $("#again").onclick = () => {
      resetTo("home");
      openCamera();
    };
  },
});
