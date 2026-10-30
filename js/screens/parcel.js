/**
 * Bildschirm "parcel": eine Paketbenachrichtigung (Funktionsmodul js/features/parcels/).
 * Zeigt den Zettel als Bild – ein Tipp vergrößert ihn bildschirmfüllend zum Vorzeigen an der Theke –,
 * darunter Abholort mit Kartenlink, Frist und Code. „Abgeholt“ löscht Zettel und Eintrag.
 */
import { registerScreen, isCurrent, render, back } from "../core/router.js";
import { app, $, esc, topbar, toast, busy, unbusy, copyText, errText } from "../core/ui.js";
import { I } from "../core/icons.js";
import { on } from "../core/events.js";
import { selected, pickedUp } from "../features/parcels/index.js";
import { pickupText, pickupState, mapsUrl } from "../features/parcels/model.js";
import { isoToDe } from "../documents/values.js";

let zoom = false;

registerScreen("parcel", {
  enter() {
    zoom = false;
  },
  leave() {
    zoom = false;
  },

  render() {
    const e = selected();
    if (!e) {
      app.innerHTML = `${topbar("Paket")}<div class="center"><p class="muted">Dieses Paket ist nicht mehr in der Liste – vermutlich schon abgeholt.</p></div>`;
      return;
    }
    const st = pickupState(e.until);
    const maps = mapsUrl(e.location, e.address);
    app.innerHTML = `${topbar(e.carrier || "Paket", { sub: e.recipient ? `für ${e.recipient}` : "" })}
      ${e.preview ? `<button class="parcelimg" id="zoom" aria-label="Zettel bildschirmfüllend zeigen"><img src="${esc(e.preview)}" alt="Benachrichtigungszettel"></button>
        <p class="muted small center-text">Antippen zum Vergrößern – zum Vorzeigen an der Theke.</p>`
        : e.file?.webUrl ? `<a class="btn block" href="${esc(e.file.webUrl)}" target="_blank" rel="noopener">${I.ext} Zettel öffnen (PDF)</a><div style="height:14px"></div>` : ""}
      <div class="card">
        <dl class="kv paykv parcelkv">
          <dt>Abholen</dt><dd><span class="${st === "ok" ? "" : "errtext"}">${esc(pickupText(e.until))}</span></dd>
          ${e.location || e.address ? `<dt>Wo</dt><dd><span>${esc(e.location)}${e.address ? `<br><span class="path">${esc(e.address)}</span>` : ""}</span>
            ${maps ? `<a class="btn small" href="${esc(maps)}" target="_blank" rel="noopener">Karte</a>` : ""}</dd>` : ""}
          ${e.code ? `<dt>Code</dt><dd><span class="mono big">${esc(e.code)}</span><button class="iconbtn copybtn" id="copyCode" aria-label="Code kopieren" title="Kopieren">${COPY}</button></dd>` : ""}
          ${e.attempted ? `<dt>Zugestellt</dt><dd>Versuch am ${esc(isoToDe(e.attempted))}</dd>` : ""}
        </dl>
      </div>
      ${e.preview && e.file?.webUrl ? `<a class="btn block" href="${esc(e.file.webUrl)}" target="_blank" rel="noopener">${I.ext} PDF in OneDrive</a><div style="height:10px"></div>` : ""}
      <button class="btn primary block" id="done">${I.check} Abgeholt</button>
      <p class="muted small">„Abgeholt“ löscht den Zettel. Er liegt danach noch etwa 30 Tage im OneDrive-Papierkorb.</p>
      ${zoom && e.preview ? `<div class="viewer" id="viewer" role="dialog" aria-label="Zettel"><img src="${esc(e.preview)}" alt="Benachrichtigungszettel"><span class="viewerhint">Tippen zum Schließen</span></div>` : ""}`;

    $("#zoom") && ($("#zoom").onclick = () => {
      zoom = true;
      render();
    });
    $("#viewer") && ($("#viewer").onclick = () => {
      zoom = false;
      render();
    });
    $("#copyCode") && ($("#copyCode").onclick = () => copyText(e.code));
    $("#done").onclick = () => done(e);
  },
});

const COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>';

async function done(e) {
  if (!confirm(`Paket von ${e.carrier} abgeholt?\n\nDer Zettel wird gelöscht (OneDrive-Papierkorb).`)) return;
  busy("Wird gelöscht …");
  try {
    await pickedUp(e);
    unbusy();
    toast("Erledigt – Zettel gelöscht");
    back();
  } catch (err) {
    unbusy();
    toast(errText(err), 6000);
  }
}

on("parcels:changed", () => isCurrent("parcel") && render());
