/**
 * Eingangskanäle: verbinden Browser-Mechanismen mit importers/index.js.
 *
 *   Kamera            – <input capture>, startet einen Scan bzw. ergänzt Seiten
 *   Dateiauswahl      – <input type=file>
 *   Hineinziehen      – Drag & Drop aufs App-Fenster (Desktop: Anhänge oder ganze Mails aus Outlook)
 *   Teilen            – Android-Teilen-Menü (Web Share Target; der Service Worker legt die Dateien
 *                       im Cache "dm-share" ab, siehe sw.js), Abholung mit checkShareInbox()
 *   Öffnen mit        – Desktop-App als Dateiprogramm (File Handling API, window.launchQueue)
 *
 * Alle Kanäle prüfen vorher, ob angemeldet ist und ob gerade ein anderes Dokument in Arbeit ist.
 */
import { S } from "../core/state.js";
import { current, render } from "../core/router.js";
import { toast } from "../core/ui.js";
import { cancelBatch } from "../core/pipeline.js";
import { ACCEPT_ATTR } from "../documents/filetypes.js";
import { appUrl } from "../services/onedrive.js";
import { importFiles, importText, addImagesToJob } from "./index.js";

const SHARE_CACHE = "dm-share";

const camInput = document.getElementById("camInput");
const fileInput = document.getElementById("fileInput");
fileInput.setAttribute("accept", ACCEPT_ATTR);

/** Kamera öffnen. Im Seitenbildschirm werden Fotos zum aktuellen Scan hinzugefügt. */
export function openCamera() {
  camInput.value = "";
  camInput.click();
}

/** Dateiauswahl öffnen. */
export function openFilePicker() {
  fileInput.value = "";
  fileInput.click();
}

const onPagesScreen = () => current() === "pages" && S.job?.kind === "scan";

camInput.addEventListener("change", async () => {
  const files = [...camInput.files];
  camInput.value = "";
  if (!files.length) return;
  if (onPagesScreen()) {
    await addImagesToJob(S.job, files, { camera: true });
    render();
  } else if (ready()) {
    await importFiles(files, { source: "camera" });
  }
});

fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files];
  fileInput.value = "";
  if (!files.length) return;
  if (onPagesScreen()) {
    await addImagesToJob(S.job, files);
    render();
  } else if (ready()) {
    await importFiles(files, { source: "file" });
  }
});

/**
 * Darf jetzt etwas Neues angenommen werden?
 * Ohne Anmeldung nein; läuft schon eine Bearbeitung, wird nachgefragt.
 */
function ready({ silent = false } = {}) {
  if (!S.account) {
    if (!silent) toast("Bitte zuerst anmelden.");
    return false;
  }
  if (S.batch || S.mailImport) {
    if (!confirm("Das aktuelle Dokument ist noch nicht abgelegt. Verwerfen und das neue übernehmen?")) return false;
    S.mailImport = null;
    cancelBatch();
  }
  return true;
}

// ---------- Hineinziehen (Desktop) ----------

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");

function showDropHint(on) {
  let el = document.getElementById("dropHint");
  if (on && !el) {
    el = document.createElement("div");
    el.id = "dropHint";
    el.className = "drop-hint";
    el.innerHTML = `<div class="box"><b>Hier loslassen</b><span>Anhänge, PDFs, Fotos oder ganze E-Mails (.msg, .eml)</span></div>`;
    document.body.appendChild(el);
  }
  if (!on) el?.remove();
}

document.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  showDropHint(true);
});
document.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
document.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) showDropHint(false);
});
document.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  showDropHint(false);
  const files = [...(e.dataTransfer.files || [])];
  if (!files.length) return toast("Es kam keine Datei an. Bei Outlook die Mail bzw. den Anhang direkt ins Fenster ziehen.", 6000);
  if (onPagesScreen()) {
    await addImagesToJob(S.job, files);
    return render();
  }
  if (ready()) await importFiles(files, { source: "drop" });
});

// ---------- Teilen (Android) ----------

/**
 * Holt Dateien ab, die über das Teilen-Menü kamen (vom Service Worker zwischengespeichert).
 * Erst nach der Anmeldung aufrufen; ohne Anmeldung bleiben die Dateien liegen.
 */
export async function checkShareInbox() {
  if (!("caches" in window)) return;
  let cache;
  try {
    if (!(await caches.has(SHARE_CACHE))) return;
    cache = await caches.open(SHARE_CACHE);
  } catch {
    return;
  }
  const base = await shareBase();
  const metaRes = await cache.match(new URL("__share/meta", base).href);
  if (!metaRes) return;
  const meta = await metaRes.json().catch(() => ({ count: 0 }));
  const files = [];
  for (let i = 0; i < (meta.count || 0); i++) {
    const r = await cache.match(new URL(`__share/${i}`, base).href);
    if (!r) continue;
    const blob = await r.blob();
    const name = decodeURIComponent(r.headers.get("x-name") || `Datei-${i + 1}`);
    files.push(new File([blob], name, { type: blob.type || r.headers.get("content-type") || "" }));
  }
  await caches.delete(SHARE_CACHE);
  if (location.search.includes("share=")) history.replaceState(history.state, "", location.pathname);
  if (!ready()) return;
  if (files.length) await importFiles(files, { source: "share" });
  else if (meta.title || meta.text || meta.url) importText(meta, { source: "share" });
  else toast("Beim Teilen ist keine Datei angekommen.");
}

/** Gleiche Basis wie im Service Worker (sw.js): dessen Gültigkeitsbereich, sonst die App-Adresse. */
async function shareBase() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.scope) return reg.scope;
  } catch {}
  return appUrl();
}

// ---------- Öffnen mit (Desktop-App) ----------

/** Dateien, mit denen die installierte App gestartet wurde. Erst nach der Anmeldung aufrufen. */
export function listenForLaunchFiles() {
  if (!("launchQueue" in window)) return;
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = [];
    for (const h of params.files) {
      try {
        files.push(await h.getFile());
      } catch {}
    }
    if (files.length && ready()) await importFiles(files, { source: "launch" });
  });
}
