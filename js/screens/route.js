/**
 * Bildschirm "route": KI-Vorschlag oder direkt ablegen? (Gilt für den aktuellen Job.)
 */
import { APP } from "../core/config.js";
import { S } from "../core/state.js";
import { registerScreen, resetTo } from "../core/router.js";
import { app, $, esc, topbar, formatSize } from "../core/ui.js";
import { I } from "../core/icons.js";
import { settings } from "../services/storage.js";
import { batchInfo, startAi, startDirect, skipCurrent, aiPossible, hasApiKey } from "../core/pipeline.js";
import { describe } from "../documents/job.js";
import { jobCard } from "./parts.js";

registerScreen("route", {
  render() {
    const job = S.job;
    if (!job) return resetTo("home");
    const b = batchInfo();
    const key = hasApiKey();
    const possible = aiPossible(job);
    const model = APP.models.find((m) => m.id === settings.get("model", APP.defaultModel));
    const d = describe(job);
    const size = job.bytes ? ` · ${formatSize(job.bytes.length)}` : job.pages?.length ? ` · ${job.pages.length} Seite${job.pages.length === 1 ? "" : "n"}` : "";
    let aiNote = esc(model ? model.label : "");
    if (!key) aiNote = "Erst in den Einstellungen einen API-Schlüssel hinterlegen.";
    else if (!possible) aiNote = "Die KI kann diesen Dateityp nicht lesen.";
    else if (job.kind === "file") aiNote = "Die KI sieht nur Dateiname und Mailtext.";

    app.innerHTML = `${topbar("Wie ablegen?", { sub: b.total > 1 ? `Dokument ${b.index + 1} von ${b.total}` : `${d.kind}${size}` })}
      ${b.total > 1 || job.source !== "camera" ? jobCard(job) : ""}
      <div class="route">
        <button id="ai" ${key && possible ? "" : "disabled"}>
          <span class="ic">${I.spark}</span>
          <span><b>KI-Vorschlag</b><span class="muted">Die KI liest das Dokument${job.mail ? " samt E-Mail" : ""} und schlägt Ordner, Typ, Absender, Titel und Datum vor. Du prüfst und bestätigst.<br><span class="small">${aiNote}</span></span></span>
        </button>
        <button id="direct">
          <span class="ic">${I.hand}</span>
          <span><b>Direkt ablegen</b><span class="muted">Ohne KI: Typ und Ordner per Tipp wählen, Absender und Titel eintippen. Das Dokument geht nur an OneDrive.</span></span>
        </button>
      </div>
      ${b.total > 1 ? `<div style="height:12px"></div><button class="btn block" id="skip">${I.skip} Dieses Dokument überspringen</button>` : ""}`;
    $("#ai").onclick = () => startAi();
    $("#direct").onclick = () => startDirect();
    $("#skip") && ($("#skip").onclick = () => skipCurrent());
  },
});
