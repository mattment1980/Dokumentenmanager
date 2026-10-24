/**
 * Bildschirm "pages": Seiten eines Scan-Jobs ansehen, ergänzen, zum Zuschneiden antippen.
 */
import { S } from "../core/state.js";
import { registerScreen, go, resetTo } from "../core/router.js";
import { app, $, $$, topbar } from "../core/ui.js";
import { I } from "../core/icons.js";
import { batchInfo } from "../core/pipeline.js";
import { openCamera, openFilePicker } from "../importers/sources.js";

registerScreen("pages", {
  render() {
    const job = S.job;
    if (!job || job.kind !== "scan") return resetTo("home");
    const n = job.pages.length;
    const b = batchInfo();
    const sub = `${n} Seite${n === 1 ? "" : "n"} · tippen zum Zuschneiden${b.total > 1 ? ` · Dokument ${b.index + 1} von ${b.total}` : ""}`;
    app.innerHTML = `${topbar("Seiten", { sub })}
      <div class="pages">
        ${job.pages.map((p, i) => `<button class="thumb" data-i="${i}" aria-label="Seite ${i + 1} bearbeiten"><img src="${p.thumb}" alt=""><span class="no">${i + 1}</span></button>`).join("")}
        <button class="thumb add" id="addCam" aria-label="Weitere Seite fotografieren">${I.plus}</button>
      </div>
      ${job.pages.some((p) => !p.detected) ? `<p class="muted small" style="margin-top:12px">Bei mindestens einer Seite wurden die Blattkanten nicht sicher erkannt. Tippe sie an, um die Ecken anzupassen.</p>` : ""}
      <div style="height:16px"></div>
      <div class="row">
        <button class="btn grow" id="addCam2">${I.camera} Weitere Seite</button>
        <button class="btn" id="addFile" aria-label="Bild aus Galerie hinzufügen">${I.file}</button>
      </div>
      <div style="height:10px"></div>
      <button class="btn primary block" id="next" ${n ? "" : "disabled"}>Weiter</button>`;
    $$(".thumb[data-i]").forEach((btn) => (btn.onclick = () => {
      S.cropIndex = Number(btn.dataset.i);
      go("crop");
    }));
    $("#addCam").onclick = $("#addCam2").onclick = () => openCamera();
    $("#addFile").onclick = () => openFilePicker();
    $("#next").onclick = () => go("route");
  },
});
