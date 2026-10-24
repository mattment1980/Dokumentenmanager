/**
 * Bildschirm "mail": Eine eingelesene E-Mail mit mehreren Anhängen – auswählen, was abgelegt wird.
 * (Mit keinem oder einem Anhang wird dieser Schritt übersprungen, siehe importers/index.js.)
 */
import { S } from "../core/state.js";
import { registerScreen, resetTo } from "../core/router.js";
import { app, $, $$, esc, topbar, busy, unbusy, toast, formatSize, errText } from "../core/ui.js";
import { I } from "../core/icons.js";
import { startBatch } from "../core/pipeline.js";
import { jobsFromMail } from "../importers/index.js";

const KIND_LABEL = { pdf: "PDF", image: "Bild → PDF", file: "Original", mail: "E-Mail" };

registerScreen("mail", {
  render() {
    const mi = S.mailImport;
    if (!mi) return resetTo("home");
    const m = mi.mail;
    const visible = m.attachments.map((a, i) => ({ a, i })).filter(({ a }) => !a.inline);
    const inline = m.attachments.map((a, i) => ({ a, i })).filter(({ a }) => a.inline);
    const row = ({ a, i }) => `<label class="pick ${a.kind ? "" : "off"}">
        <input type="checkbox" data-i="${i}" ${mi.picks.includes(i) ? "checked" : ""} ${a.kind ? "" : "disabled"}>
        <span class="grow"><span class="fname">${esc(a.name)}</span>
          <span class="path">${a.kind ? KIND_LABEL[a.kind] : "nicht unterstützt"} · ${formatSize(a.bytes.length)}</span></span>
      </label>`;
    const count = mi.picks.length + (mi.textDoc ? 1 : 0);
    app.innerHTML = `${topbar("E-Mail", { sub: "Was soll abgelegt werden?" })}
      <div class="card">
        <div class="mailhead">
          <span class="ic">${I.mail}</span>
          <div class="grow">
            <div class="fname">${esc(m.subject || "(ohne Betreff)")}</div>
            <div class="path">${esc(m.from)}${m.date ? " · " + esc(m.date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })) : ""}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Anhänge</h2>
        ${visible.length ? visible.map(row).join("") : `<p class="muted">Keine Anhänge.</p>`}
        ${inline.length ? `<details class="small" style="margin-top:8px"><summary class="muted">${inline.length} eingebettete Bilder (Logos, Signaturen)</summary>${inline.map(row).join("")}</details>` : ""}
      </div>
      <div class="card">
        <label class="pick">
          <input type="checkbox" id="textDoc" ${mi.textDoc ? "checked" : ""}>
          <span class="grow"><b>Mailtext als eigenes Dokument</b><span class="path">Zusätzlich zu den Anhängen</span></span>
        </label>
        <p class="muted small" style="margin:8px 0 0">Jedes Dokument bekommt den Mailtext als letzte Seite. Das lässt sich pro Dokument abschalten.</p>
      </div>
      <button class="btn primary block" id="go" ${count ? "" : "disabled"}>Weiter (${count} Dokument${count === 1 ? "" : "e"})</button>
      <div style="height:8px"></div>
      <button class="btn block" id="cancel">Abbrechen</button>`;

    $$("input[data-i]").forEach((cb) => (cb.onchange = () => {
      const i = Number(cb.dataset.i);
      mi.picks = cb.checked ? [...new Set([...mi.picks, i])].sort((x, y) => x - y) : mi.picks.filter((x) => x !== i);
      this.render();
    }));
    $("#textDoc").onchange = (e) => {
      mi.textDoc = e.target.checked;
      this.render();
    };
    $("#cancel").onclick = () => {
      S.mailImport = null;
      resetTo("home");
    };
    $("#go").onclick = async () => {
      busy("Dokumente werden vorbereitet …");
      try {
        const jobs = await jobsFromMail(mi.mail, mi.picks, { textDoc: mi.textDoc });
        unbusy();
        startBatch(jobs);
      } catch (e) {
        unbusy();
        toast(errText(e), 6000);
      }
    };
  },
});
