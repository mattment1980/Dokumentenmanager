/**
 * Bildschirm "review": Ablagedaten prüfen und ablegen.
 * Zeigt den KI-Vorschlag (oder leere Felder beim direkten Weg); alle Felder sind änderbar,
 * der Dateiname wird live berechnet.
 */
import { S, folderByName } from "../core/state.js";
import { registerScreen, resetTo, render } from "../core/router.js";
import { app, $, esc, topbar } from "../core/ui.js";
import { I } from "../core/icons.js";
import { batchInfo, validateAll, planSave, targetPath, saveCurrent, skipCurrent, abortAi } from "../core/pipeline.js";
import { getReviewSections } from "../core/extensions.js";
import { canAppendMail } from "../documents/job.js";
import { jobCard } from "./parts.js";

const screen = {
  render() {
    const job = S.job;
    const d = job?.draft;
    if (!d) return resetTo("home");
    const b = batchInfo();
    const sub = b.total > 1 ? `Dokument ${b.index + 1} von ${b.total}` : "";

    if (d.aiPending) {
      app.innerHTML = `${topbar("KI-Vorschlag", { sub })}<div class="center"><div class="spinner"></div><div><b>Die KI liest das Dokument …</b><div class="muted small">Das dauert meist 5 bis 15 Sekunden.</div></div>
        <button class="btn" id="skipAi">Abbrechen und direkt ablegen</button></div>`;
      $("#skipAi").onclick = () => {
        abortAi();
        render();
      };
      return;
    }

    const folder = folderByName(d.folder);
    const subs = folder?.children || [];
    const ai = d.ai;
    const conf = ai && typeof ai.confidence === "number" ? Math.round(ai.confidence * 100) : null;
    const st = S.structure;
    const mailToggle = canAppendMail(job)
      ? `<label class="pick"><input type="checkbox" id="appendMail" ${job.appendMail ? "checked" : ""}>
          <span class="grow"><b>Mailtext als letzte Seite anhängen</b><span class="path">Von, An, Datum, Betreff und Text der E-Mail</span></span></label>`
      : job.kind === "pdf" && job.signed && job.mail
        ? `<p class="muted small" style="margin:0">Digital signiertes PDF: wird unverändert abgelegt, ohne Mailtext (sonst wäre die Signatur ungültig).</p>`
        : job.kind === "file"
          ? `<p class="muted small" style="margin:0">Wird im Original (${esc(job.ext.toUpperCase())}) abgelegt${job.mail ? ", ohne Mailtext" : ""}.</p>`
          : "";

    app.innerHTML = `${topbar("Prüfen & ablegen", { sub })}
      ${b.total > 1 || job.mail ? jobCard(job) : ""}
      ${d.aiError ? `<div class="banner err"><span class="grow">${esc(d.aiError)}<br><span class="small">Du kannst das Dokument trotzdem direkt ablegen.</span></span></div>` : ""}
      ${ai ? `<div class="banner ${conf !== null && conf < 60 ? "warn" : "info"}"><span class="grow"><b>KI-Vorschlag${conf !== null ? ` (${conf} % sicher)` : ""}</b><br>${esc(ai.reason)}${!d.dateFromAi ? "<br>Kein Briefdatum erkannt, Datum bitte prüfen." : ""}</span></div>` : ""}

      <div class="card">
        <h2>Dokumenttyp</h2>
        <div class="chips" id="dt">${st.doctypes.map((t) => `<button class="chip ${d.doctype === t.name ? "on" : ""} ${ai && ai.doctype === t.name ? "ai" : ""}" data-v="${esc(t.name)}">${esc(t.name)}</button>`).join("")}</div>
      </div>

      <div class="card">
        <h2>Ordner</h2>
        <div class="folders" id="fo">${st.folders.map((f) => {
          const m = f.name.match(/^(\d+)_(.*)$/);
          return `<button class="chip ${d.folder === f.name ? "on" : ""} ${ai && ai.folder === f.name ? "ai" : ""}" data-v="${esc(f.name)}">${m ? `<span class="n">${esc(m[1])}</span>${esc(m[2])}` : esc(f.name)}</button>`;
        }).join("")}</div>
        ${subs.length ? `<div style="height:12px"></div><h2>Unterordner</h2>
          <div class="chips" id="sf">${subs.map((c) => `<button class="chip ${d.subfolder === c.name ? "on" : ""} ${ai && ai.subfolder === c.name && ai.folder === d.folder ? "ai" : ""}" data-v="${esc(c.name)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      </div>

      <div class="card">
        <label class="field"><span>Briefdatum</span><input type="date" id="date" value="${esc(d.date)}"></label>
        <label class="field"><span>Absender (kurz)</span><input type="text" id="sender" value="${esc(d.sender)}" placeholder="z. B. Finanzamt" autocomplete="off"></label>
        <label class="field" style="margin-bottom:0"><span>Titel (Inhalt)</span><input type="text" id="title" value="${esc(d.title)}" placeholder="z. B. Einkommensteuer 2025" autocomplete="off"></label>
      </div>

      <div id="ext">${getReviewSections(job, d).map((sec) => `<div data-sec="${esc(sec.id)}">${sec.render(job, d)}</div>`).join("")}</div>
      ${mailToggle ? `<div class="card">${mailToggle}</div>` : ""}
      ${b.total > 1 ? `<button class="btn block" id="skip">${I.skip} Dieses Dokument überspringen</button><div style="height:4px"></div>` : ""}

      <div class="actionbar">
        <div class="preview" id="pv"></div>
        <button class="btn primary block" id="save">${I.check} Ablegen${b.total > 1 && b.index < b.total - 1 ? " und weiter" : ""}</button>
      </div>`;

    const pick = (id, fn) => {
      const el = $(id);
      if (el) el.onclick = (e) => {
        const btn = e.target.closest("[data-v]");
        if (btn) fn(btn.dataset.v);
      };
    };
    pick("#dt", (v) => {
      d.doctype = v;
      this.render();
    });
    pick("#fo", (v) => {
      if (d.folder !== v) {
        d.folder = v;
        const f = folderByName(v);
        d.subfolder = f?.children?.length === 1 ? f.children[0].name : "";
        if (ai && ai.folder === v) d.subfolder = ai.subfolder || d.subfolder;
      }
      this.render();
    });
    pick("#sf", (v) => {
      d.subfolder = v;
      this.render();
    });
    for (const id of ["date", "sender", "title"]) {
      $("#" + id).addEventListener("input", (e) => {
        d[id] = e.target.value;
        this.preview();
      });
    }
    $("#appendMail") && ($("#appendMail").onchange = (e) => (job.appendMail = e.target.checked));
    // Zusatzabschnitte von Funktionsmodulen (z. B. Rechnungen) anbinden
    for (const sec of getReviewSections(job, d)) {
      const root = $(`[data-sec="${sec.id}"]`);
      if (root && sec.bind) sec.bind(root, job, d, () => this.render(), () => this.preview());
    }
    $("#skip") && ($("#skip").onclick = () => skipCurrent());
    $("#save").onclick = () => saveCurrent();
    this.preview();
  },

  preview() {
    const job = S.job;
    const d = job.draft;
    const v = validateAll(job, d);
    $("#pv").innerHTML = `${esc(planSave(job, d).fileName)}<div class="path">${esc(targetPath(job, d))}</div>${v ? `<div class="path" style="color:var(--warn)">${esc(v)}</div>` : ""}`;
    $("#save").disabled = !!v;
  },
};

registerScreen("review", screen);
