/**
 * Funktionsmodul "Paketbenachrichtigungen": Abholzettel als Box auf der Startseite, „Abgeholt“ löscht.
 *
 * Ablauf
 *   1. Neuer Dokumenttyp „Paketbenachrichtigung“ (wird bei Bedarf in der Konfiguration ergänzt).
 *   2. Prüfen-Bildschirm: Dienstleister, Abholort und Adresse, Zustellversuch, Abholfrist, Code, Für wen
 *      (KI-Feld "paket"). Ablageort ist fest: 00_Eingang/Paketbenachrichtigungen.
 *   3. Beim Ablegen eines Scans wird ein Bild der ersten Seite mitgespeichert (Ablage-Vorbereitung),
 *      damit der Zettel samt Barcode an der Theke bildschirmfüllend gezeigt werden kann – auch auf dem
 *      Gerät der anderen Person und ohne Netz.
 *   4. Nach dem Hochladen: Eintrag in <Archiv>/_Paketbenachrichtigungen.json → Box auf der Startseite
 *      (nur, wenn etwas offen ist).
 *   5. „Abgeholt“ (screens/parcel.js) löscht die Datei – sie landet im OneDrive-Papierkorb – und den Eintrag.
 *
 * Abschaltbar in den Einstellungen (core/features.js, id "parcels").
 */
import { APP } from "../../core/config.js";
import { S } from "../../core/state.js";
import { esc } from "../../core/ui.js";
import { on } from "../../core/events.js";
import { go } from "../../core/router.js";
import { registerFeature, isEnabled } from "../../core/features.js";
import { registerAiField, registerDraftInit, registerReviewSection, registerSaveFilter, registerSavePrepare, registerHomeSection } from "../../core/extensions.js";
import { ensureFeatureSetup } from "../../core/structure.js";
import { sharedList, newId, createdByFrom } from "../../core/sharedlist.js";
import * as od from "../../services/onedrive.js";
import { isValidIsoDate } from "../../documents/naming.js";
import { canvasToJpeg } from "../../documents/scan.js";
import { FEATURE, SUBFOLDER, isParcelType, setupStructure, needsSetup, statusText, pickupState, needsPickup, byDeadline, jpegDataUrl } from "./model.js";

registerFeature({
  id: FEATURE,
  label: "Paketbenachrichtigungen",
  description: "Abholzettel als Box auf der Startseite – mit Abholort, Frist und Code; der Zettel lässt sich an der Theke vorzeigen.",
});

export const list = sharedList({ file: "_Paketbenachrichtigungen.json", cacheKey: "parcels", event: "parcels:changed", label: "Paketliste" });

export const TARGET = [APP.inboxFolder, SUBFOLDER];
/** Vorschaubild: lange Kante in Pixeln und Obergrenze der Dateigröße (Barcodes sollen lesbar bleiben). */
const PREVIEW_EDGE = 1600;
const PREVIEW_MAX_BYTES = 450 * 1024;

const applies = (job, d) => isParcelType(S.structure, d.doctype);

// Gewählter Eintrag für den Bildschirm "parcel"
let selectedId = null;
export const selected = () => list.current().open.find((e) => e.id === selectedId) || null;
export function openParcel(id) {
  selectedId = id;
  go("parcel");
}

// ---------- 1. Entwurf und KI ----------

registerDraftInit((d) => {
  d.parcel = { carrier: "", location: "", address: "", attempted: "", until: "", redelivery: "", code: "", recipient: "" };
});

registerAiField({
  feature: FEATURE,
  name: "paket",
  schema: {
    type: "object",
    description: "Nur bei Paketbenachrichtigungen ausfüllen.",
    properties: {
      dienstleister: { type: "string" },
      abholort: { type: "string" },
      adresse: { type: "string" },
      zustellversuch_am: { type: "string", description: "JJJJ-MM-TT oder leer" },
      abholbar_bis: { type: "string", description: "JJJJ-MM-TT oder leer" },
      neuer_zustellversuch_am: { type: "string", description: "JJJJ-MM-TT oder leer" },
      code: { type: "string" },
      empfaenger: { type: "string" },
    },
  },
  rule:
    "Benachrichtigungskarten und -schreiben von Paketdiensten (z. B. 'Wir haben Sie nicht angetroffen', Zustellversuch " +
    "fehlgeschlagen, Abholung in Filiale, Packstation oder Paketshop, Paket beim Nachbarn abgegeben, neuer Zustellversuch) " +
    "haben IMMER den Dokumenttyp Paketbenachrichtigung, auch wenn kein Abholort genannt ist. " +
    "Das Feld paket nur bei diesem Dokumenttyp ausfüllen, sonst weglassen. dienstleister = Paketdienst kurz (z. B. 'DHL', 'Hermes', " +
    "'DPD', 'GLS', 'UPS', 'Deutsche Post'); abholort = Name der Abholstelle (z. B. 'Postfiliale', 'Packstation 123', " +
    "'Paketshop Kiosk am Markt', beim Nachbarn dessen Name); leer, wenn nur ein neuer Zustellversuch angekündigt ist; adresse = Straße mit Hausnummer, PLZ und Ort der Abholstelle; zustellversuch_am = Datum " +
    "des Zustellversuchs JJJJ-MM-TT; abholbar_bis = letzter Abholtag JJJJ-MM-TT – steht nur eine Dauer da (z. B. " +
    "'7 Werktage'), ab dem Zustellversuch rechnen (Werktage = Montag bis Samstag), sonst leer; " +
    "neuer_zustellversuch_am = Datum eines angekündigten neuen Zustellversuchs, sonst leer; code = Sendungsnummer, " +
    "Abholcode oder Abholnummer exakt wie gedruckt; empfaenger = Name, an den das Paket adressiert ist.",
  apply(d, v) {
    if (!v || typeof v !== "object") return;
    Object.assign(d.parcel, {
      carrier: String(v.dienstleister || "").trim() || d.sender,
      location: String(v.abholort || "").trim(),
      address: String(v.adresse || "").trim(),
      attempted: isValidIsoDate(v.zustellversuch_am) ? v.zustellversuch_am : "",
      until: isValidIsoDate(v.abholbar_bis) ? v.abholbar_bis : "",
      redelivery: isValidIsoDate(v.neuer_zustellversuch_am) ? v.neuer_zustellversuch_am : "",
      code: String(v.code || "").trim(),
      recipient: String(v.empfaenger || "").trim(),
    });
  },
});

// ---------- 2. Abschnitt im Prüfen-Bildschirm ----------

registerReviewSection({
  feature: FEATURE,
  id: "parcel",
  applies,
  target: () => TARGET,
  targetNote: "Erscheint auf der Startseite unter „Pakete“. Nach „Abgeholt“ bzw. „Erledigt“ wird der Zettel gelöscht (OneDrive-Papierkorb).",
  render(job, d) {
    const p = d.parcel;
    return `<div class="card" id="parcelSec">
      <h2>Paket</h2>
      <div class="row">
        <label class="field grow"><span>Dienstleister</span><input type="text" data-q="carrier" value="${esc(p.carrier)}" placeholder="${esc(d.sender || "z. B. DHL")}" autocomplete="off"></label>
        <label class="field grow"><span>Für wen</span><input type="text" data-q="recipient" value="${esc(p.recipient)}" autocomplete="off"></label>
      </div>
      <label class="field"><span>Abholort</span><input type="text" data-q="location" value="${esc(p.location)}" placeholder="leer = neuer Zustellversuch" autocomplete="off"></label>
      <label class="field"><span>Adresse</span><input type="text" data-q="address" value="${esc(p.address)}" autocomplete="off"></label>
      <div class="row">
        <label class="field grow"><span>Zustellversuch am</span><input type="date" data-q="attempted" value="${esc(p.attempted)}"></label>
        <label class="field grow"><span>Abholbar bis</span><input type="date" data-q="until" value="${esc(p.until)}"></label>
      </div>
      ${p.location || p.address ? "" : `<label class="field"><span>Neuer Zustellversuch am</span><input type="date" data-q="redelivery" value="${esc(p.redelivery)}"></label>`}
      <label class="field" style="margin-bottom:0"><span>Sendungsnummer / Abholcode</span><input type="text" data-q="code" value="${esc(p.code)}" autocomplete="off" spellcheck="false"></label>
    </div>`;
  },
  bind(root, job, d, rerender, refresh) {
    root.querySelectorAll("[data-q]").forEach((inp) =>
      inp.addEventListener("input", () => {
        d.parcel[inp.dataset.q] = inp.value;
        refresh();
      })
    );
    // Abholort leer/gefüllt schaltet das Feld „Neuer Zustellversuch am“ um
    root.querySelectorAll('[data-q="location"],[data-q="address"]').forEach((inp) => inp.addEventListener("change", rerender));
  },
  validate(job, d) {
    const p = d.parcel;
    if (!String(p.carrier || d.sender).trim()) return "Bitte den Paketdienst eintragen.";
    if (p.until && !isValidIsoDate(p.until)) return "Bitte gültiges Datum für „Abholbar bis“ eingeben.";
    if (p.attempted && !isValidIsoDate(p.attempted)) return "Bitte gültiges Datum für den Zustellversuch eingeben.";
    return "";
  },
});

// ---------- 3. Ablegen ----------

registerSaveFilter(
  (plan) => {
    const d = plan.draft;
    if (!isParcelType(S.structure, d.doctype)) return;
    const p = d.parcel;
    plan.description += p.location || p.address ? " · Paket zum Abholen" : " · Paket: neuer Zustellversuch";
    plan.meta.parcel = {
      carrier: String(p.carrier || "").trim() || String(d.sender).trim(),
      location: String(p.location || "").trim(),
      address: String(p.address || "").trim(),
      attempted: p.attempted || "",
      until: p.until || "",
      redelivery: p.location || p.address ? "" : p.redelivery || "",
      code: String(p.code || "").trim(),
      recipient: String(p.recipient || "").trim(),
      title: d.title,
    };
  },
  { feature: FEATURE }
);

// Bild der ersten Seite für die Anzeige an der Theke (nur bei Scans; PDFs werden über OneDrive geöffnet)
registerSavePrepare(
  async (plan) => {
    const p = plan.meta.parcel;
    const page = plan.job.kind === "scan" ? plan.job.pages?.[0] : null;
    if (!p || !page?.out) return;
    try {
      let j = await canvasToJpeg(page.out, 0.8, PREVIEW_EDGE);
      if (j.bytes.length > PREVIEW_MAX_BYTES) j = await canvasToJpeg(page.out, 0.65, 1200);
      if (j.bytes.length <= PREVIEW_MAX_BYTES) p.preview = jpegDataUrl(j.bytes);
    } catch (e) {
      console.warn("Vorschaubild für das Paket nicht erstellt", e);
    }
  },
  { feature: FEATURE }
);

on("queue:uploaded", async ({ item, result }) => {
  const p = item.meta?.parcel;
  if (!p) return;
  try {
    await list.update((d) => {
      if (d.open.some((e) => e.file?.id === result.id)) return;
      d.open.push({
        ...p,
        id: newId("p"),
        created: Date.now(),
        createdBy: createdByFrom(item.description),
        file: { driveId: result.driveId || "", id: result.id, name: result.name, webUrl: result.webUrl || "" },
      });
    }, item.archive);
  } catch (e) {
    console.error("Paketliste konnte nicht aktualisiert werden", e);
  }
});

let settingUp = false;
on("config:loaded", async (st) => {
  if (!isEnabled(FEATURE, st)) return;
  if (S.account && !S.configMissing && needsSetup(st) && !settingUp) {
    settingUp = true;
    await ensureFeatureSetup("Paketbenachrichtigungen", setupStructure);
    settingUp = false;
  }
  list.refresh();
});

// ---------- 4. Abgeholt ----------

/** Paket abgeholt: Datei löschen (OneDrive-Papierkorb) und Eintrag entfernen. */
export async function pickedUp(entry) {
  if (entry.file?.id) await od.deleteItem(entry.file); // fehlt die Datei schon, ist das in Ordnung
  await list.remove(entry.id);
}

// ---------- 5. Box auf der Startseite (nur, wenn etwas offen ist) ----------

registerHomeSection({
  feature: FEATURE,
  id: "parcels",
  render() {
    const items = [...list.current().open].sort(byDeadline);
    if (!items.length) return "";
    return `<div class="card parcels" id="parcelBox">
      <h2>Pakete</h2>
      <ul class="list">${items.map((e) => {
        const st = needsPickup(e) ? pickupState(e.until) : "ok";
        return `<li><button class="parcelrow" data-parcel="${esc(e.id)}">
          <span class="grow"><span class="fname">${esc(e.carrier)}${e.location ? ` · ${esc(e.location)}` : ""}</span>
            <span class="path ${st === "over" || st === "urgent" ? "errtext" : ""}">${esc(statusText(e))}${e.recipient ? ` · für ${esc(e.recipient)}` : ""}</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </button></li>`;
      }).join("")}</ul>
    </div>`;
  },
  bind(root) {
    root.querySelectorAll("[data-parcel]").forEach((b) => (b.onclick = () => openParcel(b.dataset.parcel)));
  },
});
