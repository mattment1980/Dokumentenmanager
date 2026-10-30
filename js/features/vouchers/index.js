/**
 * Funktionsmodul "Gutscheine & Rabatte": eigener Hauptordner, Liste offener Gutscheine und Rabatte, „Benutzt“.
 *
 * Ablauf
 *   1. Neuer Dokumenttyp „Gutschein“ und Hauptordner (fortlaufend nummeriert, z. B. 15_Gutscheine).
 *      Beides wird beim ersten Laden der Konfiguration ergänzt, falls es fehlt (model.js → setupStructure).
 *   2. Dokumenttyp Gutschein/Rabatt → Prüfen-Bildschirm fragt „Gutschein | Rabatt“ und zeigt die passenden
 *      Felder; die KI füllt sie vor (KI-Feld "gutschein"). Der Ablageort ist fest: der Gutscheinordner.
 *      Rabatte heißen im Dateinamen "…_Rabatt_…", zählen nicht zur Euro-Summe und haben kein „Teilweise“.
 *   3. Nach dem Hochladen (Ereignis "queue:uploaded") kommt der Gutschein in die gemeinsame Liste
 *      <Archiv>/_Gutscheine.json.
 *   4. Liste (screens/vouchers.js):
 *        Benutzt / Abgelaufen → Datei nach <Gutscheinordner>/Verbraucht, Eintrag raus
 *        Teilweise eingelöst  → neuer Restbetrag, Eintrag bleibt
 *
 * Abschaltbar in den Einstellungen (core/features.js, id "vouchers").
 */
import { S, uploaderName } from "../../core/state.js";
import { esc } from "../../core/ui.js";
import { on } from "../../core/events.js";
import { go } from "../../core/router.js";
import { registerFeature, isEnabled } from "../../core/features.js";
import { registerAiField, registerDraftInit, registerReviewSection, registerSaveFilter, registerHomeSection } from "../../core/extensions.js";
import { ensureFeatureSetup } from "../../core/structure.js";
import { sharedList, newId, createdByFrom } from "../../core/sharedlist.js";
import { history } from "../../services/storage.js";
import * as od from "../../services/onedrive.js";
import { isValidIsoDate, todayIso, buildFileName } from "../../documents/naming.js";
import { parseAmount, formatAmount, plainAmount } from "../../documents/values.js";
import {
  FEATURE, USED_FOLDER, REDEEM, KINDS, DISCOUNT_SHORT, isVoucherType, folderName, setupStructure, needsSetup, summarize,
} from "./model.js";

registerFeature({
  id: FEATURE,
  label: "Gutscheine & Rabatte",
  description: "Gutscheine und Rabattaktionen im eigenen Ordner ablegen, Liste mit Code und Ablaufdatum, „Benutzt“.",
});

export const list = sharedList({ file: "_Gutscheine.json", cacheKey: "vouchers", event: "vouchers:changed", label: "Gutscheinliste" });

const applies = (job, d) => isVoucherType(S.structure, d.doctype);

// ---------- 1. Entwurf und KI ----------

registerDraftInit((d) => {
  d.voucher = { kind: "voucher", merchant: "", what: "", amount: "", discount: "", code: "", pin: "", validUntil: "", redeem: "" };
});

registerAiField({
  feature: FEATURE,
  name: "gutschein",
  schema: {
    type: "object",
    description: "Nur bei Gutscheinen und Rabatten ausfüllen.",
    properties: {
      art: { type: "string", enum: ["gutschein", "rabatt"] },
      einloesbar_bei: { type: "string" },
      rabatt: { type: "string" },
      wofuer: { type: "string" },
      betrag: { type: "number" },
      code: { type: "string" },
      pin: { type: "string" },
      gueltig_bis: { type: "string", description: "JJJJ-MM-TT oder leer" },
      einloesung: { type: "string", enum: ["online", "vor_ort", "beides", ""] },
    },
  },
  rule:
    "nur beim Dokumenttyp für Gutscheine und Rabatte, sonst weglassen. art = gutschein, wenn er einen Geldwert oder eine " +
    "Leistung verschenkt bzw. gutschreibt; rabatt bei Rabattaktionen, Rabatt- oder Aktionscodes, Coupons und Prozent-Angeboten. " +
    "einloesbar_bei = Händler oder Dienstleister, bei dem eingelöst wird, kurz (wie sender); " +
    "wofuer = beim Gutschein, wofür er gilt, 1 bis 5 Wörter (z. B. 'Einkauf', 'Massage 60 Minuten', 'Abendessen für 2'); " +
    "beim Rabatt, worauf er gilt, mit Bedingungen kurz (z. B. 'alles außer Bücher, ab 50 € Einkauf'); " +
    "rabatt = nur beim Rabatt die Höhe kurz (z. B. '20 %', '10 €', '2 für 1'); " +
    "betrag = nur beim Gutschein der Wert in Euro, wenn ein Geldbetrag genannt ist; code = Gutschein- bzw. Rabattcode oder " +
    "Gutscheinnummer exakt wie gedruckt; pin = PIN oder Sicherheitscode, falls vorhanden; gueltig_bis = Ablaufdatum " +
    "JJJJ-MM-TT, nur wenn auf dem Gutschein angegeben (nicht schätzen), sonst leer; einloesung = online, vor_ort oder beides, " +
    "wenn erkennbar, sonst leer.",
  apply(d, v) {
    if (!v || typeof v !== "object") return;
    const amount = parseAmount(v.betrag);
    const discount = v.art === "rabatt";
    Object.assign(d.voucher, {
      kind: discount ? "discount" : "voucher",
      merchant: String(v.einloesbar_bei || "").trim() || d.sender,
      what: String(v.wofuer || "").trim(),
      amount: !discount && amount !== null && amount > 0 ? plainAmount(amount) : "",
      discount: discount ? String(v.rabatt || "").trim() : "",
      code: String(v.code || "").trim(),
      pin: String(v.pin || "").trim(),
      validUntil: isValidIsoDate(v.gueltig_bis) ? v.gueltig_bis : "",
      redeem: { online: "online", vor_ort: "store", beides: "both" }[v.einloesung] || "",
    });
  },
});

// ---------- 2. Abschnitt im Prüfen-Bildschirm ----------

registerReviewSection({
  feature: FEATURE,
  id: "voucher",
  applies,
  target: () => [folderName(S.structure)],
  targetNote: "Gutscheine und Rabatte werden immer hier abgelegt und erscheinen in der Liste „Gutscheine & Rabatte“.",
  render(job, d) {
    const v = d.voucher;
    const disc = v.kind === "discount";
    return `<div class="card" id="vou">
      <h2>Gutschein oder Rabatt?</h2>
      <div class="seg" id="vouKind" style="margin-bottom:14px">${KINDS.map(([k, l]) => `<button data-k="${k}" class="${v.kind === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <label class="field"><span>Einlösbar bei</span><input type="text" data-v="merchant" value="${esc(v.merchant)}" placeholder="${esc(d.sender || "z. B. Buchhandlung, Therme")}" autocomplete="off"></label>
      ${disc ? `
      <div class="row">
        <label class="field grow"><span>Rabatt</span><input type="text" data-v="discount" value="${esc(v.discount)}" placeholder="z. B. 20 % oder 10 €" autocomplete="off"></label>
        <label class="field grow"><span>Gültig bis</span><input type="date" data-v="validUntil" value="${esc(v.validUntil)}"></label>
      </div>
      <label class="field"><span>Worauf</span><input type="text" data-v="what" value="${esc(v.what)}" placeholder="z. B. alles außer Bücher, ab 50 € Einkauf" autocomplete="off"></label>` : `
      <label class="field"><span>Wofür</span><input type="text" data-v="what" value="${esc(v.what)}" placeholder="z. B. Einkauf, Massage 60 Minuten" autocomplete="off"></label>
      <div class="row">
        <label class="field grow"><span>Betrag (€)</span><input type="text" data-v="amount" value="${esc(v.amount)}" inputmode="decimal" placeholder="leer bei Leistung" autocomplete="off"></label>
        <label class="field grow"><span>Gültig bis</span><input type="date" data-v="validUntil" value="${esc(v.validUntil)}"></label>
      </div>`}
      <div class="row">
        <label class="field grow"><span>Code</span><input type="text" data-v="code" value="${esc(v.code)}" autocomplete="off" spellcheck="false"></label>
        <label class="field grow"><span>PIN</span><input type="text" data-v="pin" value="${esc(v.pin)}" autocomplete="off" spellcheck="false"></label>
      </div>
      <div class="small muted" style="margin-bottom:6px">Einlösung</div>
      <div class="seg" id="vouRedeem">${REDEEM.map(([k, l]) => `<button data-r="${k}" class="${v.redeem === k ? "on" : ""}">${l}</button>`).join("")}</div>
    </div>`;
  },
  bind(root, job, d, rerender, refresh) {
    root.querySelector("#vouKind").onclick = (e) => {
      const b = e.target.closest("[data-k]");
      if (!b || d.voucher.kind === b.dataset.k) return;
      d.voucher.kind = b.dataset.k;
      rerender();
    };
    root.querySelector("#vouRedeem").onclick = (e) => {
      const b = e.target.closest("[data-r]");
      if (!b) return;
      d.voucher.redeem = d.voucher.redeem === b.dataset.r ? "" : b.dataset.r;
      rerender();
    };
    root.querySelectorAll("[data-v]").forEach((inp) =>
      inp.addEventListener("input", () => {
        d.voucher[inp.dataset.v] = inp.value;
        refresh();
      })
    );
  },
  validate(job, d) {
    const v = d.voucher;
    if (!String(v.merchant || d.sender).trim()) return "Bitte eintragen, wo der Gutschein einlösbar ist.";
    if (v.validUntil && !isValidIsoDate(v.validUntil)) return "Bitte gültiges Ablaufdatum eingeben.";
    if (v.kind === "discount") return String(v.discount).trim() ? "" : "Bitte die Höhe des Rabatts eintragen (z. B. 20 %).";
    if (String(v.amount).trim()) {
      const a = parseAmount(v.amount);
      if (a === null || a <= 0) return "Bitte gültigen Betrag eintragen (oder leer lassen).";
    }
    if (v.validUntil && !isValidIsoDate(v.validUntil)) return "Bitte gültiges Ablaufdatum eingeben.";
    if (!String(v.what).trim() && !String(v.amount).trim()) return "Bitte Betrag oder „Wofür“ eintragen.";
    return "";
  },
});

// ---------- 3. Ablage-Filter ----------

registerSaveFilter(
  (plan) => {
    const d = plan.draft;
    if (!isVoucherType(S.structure, d.doctype)) return;
    const v = d.voucher;
    const disc = v.kind === "discount";
    // Rabatte heißen im Dateinamen "Rabatt" statt "Gutschein"
    if (disc) plan.fileName = buildFileName({ date: d.date, sender: d.sender, doctypeShort: DISCOUNT_SHORT, title: d.title, ext: plan.job.ext });
    const description = plan.description;
    plan.description += disc ? " · Rabatt offen" : " · Gutschein offen";
    plan.meta.voucher = {
      kind: disc ? "discount" : "voucher",
      merchant: String(v.merchant || "").trim() || String(d.sender).trim(),
      what: String(v.what || "").trim(),
      amount: !disc && String(v.amount).trim() ? parseAmount(v.amount) : null,
      discount: disc ? String(v.discount || "").trim() : "",
      code: String(v.code || "").trim(),
      pin: String(v.pin || "").trim(),
      validUntil: v.validUntil || "",
      redeem: v.redeem || "",
      title: d.title,
      folder: plan.rel[0],
      description,
    };
  },
  { feature: FEATURE }
);

// ---------- 4. Nach dem Hochladen: in die Liste ----------

on("queue:uploaded", async ({ item, result }) => {
  const v = item.meta?.voucher;
  if (!v) return;
  try {
    await list.update((d) => {
      if (d.open.some((e) => e.file?.id === result.id)) return;
      d.open.push({
        ...v,
        id: newId("g"),
        created: Date.now(),
        createdBy: createdByFrom(item.description),
        file: { driveId: result.driveId || "", id: result.id, name: result.name, webUrl: result.webUrl || "" },
      });
    }, item.archive);
  } catch (e) {
    console.error("Gutscheinliste konnte nicht aktualisiert werden", e);
  }
});

// Konfiguration geladen (Anmeldung, Archivwechsel, Schalter umgelegt): fehlende Teile ergänzen, Liste laden
let settingUp = false;
on("config:loaded", async (st) => {
  if (!isEnabled(FEATURE, st)) return;
  if (S.account && !S.configMissing && needsSetup(st) && !settingUp) {
    settingUp = true;
    await ensureFeatureSetup("Gutscheine & Rabatte", setupStructure);
    settingUp = false;
  }
  list.refresh();
});

// ---------- 5. Aktionen aus der Liste ----------

/**
 * Gutschein aussortieren: Datei nach <Gutscheinordner>/Verbraucht, Eintrag aus der Liste.
 * @param {"used"|"expired"} reason
 */
export async function retire(entry, reason = "used") {
  const who = uploaderName();
  const today = new Date().toLocaleDateString("de-DE");
  const note = reason === "expired" ? `Abgelaufen, aussortiert am ${today} von ${who}` : `Eingelöst am ${today} von ${who}`;
  const folder = entry.folder || folderName(S.structure);
  const moved = await od.moveItem(entry.file, [folder, USED_FOLDER], entry.file.name, {
    description: `${entry.description || ""} · ${note}`,
    archive: S.archive,
  });
  await list.remove(entry.id);
  await history.add({
    id: `vou-${entry.id}`,
    created: Date.now(),
    name: moved.name,
    path: [S.archive.mode === "shared" ? S.archive.name : S.archive.path, folder, USED_FOLDER].join(" / "),
    webUrl: moved.webUrl,
  });
  return moved;
}

/** Teilweise eingelöst: neuer Restbetrag, Verlauf im Eintrag. */
export function redeemPartly(entry, rest) {
  const who = uploaderName();
  return list.update((d) => {
    const e = d.open.find((x) => x.id === entry.id);
    if (!e) throw new Error("Der Gutschein steht nicht mehr in der Liste.");
    if (e.originalAmount === undefined) e.originalAmount = e.amount;
    e.log = [...(e.log || []), { date: todayIso(), by: who, from: e.amount, to: rest }];
    e.amount = rest;
  });
}

/** Eintrag nur aus der Liste nehmen (Datei bleibt, wo sie ist). */
export const removeEntry = (entry) => list.remove(entry.id);

// ---------- 6. Kachel auf der Startseite ----------

registerHomeSection({
  feature: FEATURE,
  id: "vouchers",
  render() {
    const s = summarize(list.current().open);
    const notes = [s.soon ? `${s.soon} läuft bald ab` : "", s.expired ? `${s.expired} abgelaufen` : ""].filter(Boolean);
    return `<button class="tile ${s.soon || s.expired ? "warnsoft" : ""} ${s.count ? "" : "quiet"}" id="tileVouchers">
      <span class="grow"><b>Gutscheine & Rabatte</b><span class="path">${s.count ? `${s.count} offen${notes.length ? " · " + notes.join(" · ") : ""}` : "Keine offenen Gutscheine oder Rabatte"}</span></span>
      ${s.sum ? `<span class="amount">${esc(formatAmount(s.sum))}</span>` : ""}
    </button>`;
  },
  bind(root) {
    const b = root.querySelector("#tileVouchers");
    if (b) b.onclick = () => go("vouchers");
  },
});
