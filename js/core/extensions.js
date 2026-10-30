/**
 * Erweiterungspunkte – hier docken Funktionsmodule (js/features/…) an, ohne den Kern zu ändern.
 *
 *   registerAiField(def)        zusätzliche Felder, die die KI ausfüllen soll
 *                               def = { name, schema, rule, apply(draft, value, job) }
 *   registerReviewSection(def)  zusätzlicher Abschnitt im Prüfen-Bildschirm
 *                               def = { id, applies(job, draft), render(job, draft) → HTML,
 *                                       bind(root, job, draft, rerender, refresh), validate(job, draft) → "" | Meldung,
 *                                       target(job, draft) → ["Ordner", "Unterordner"] | null   (optional),
 *                                       targetNote → Text unter dem festen Ablageort         (optional) }
 *                               Liefert target() einen Ordner, ist der Ablageort fest: Ordnerwahl im Prüfen-
 *                               Bildschirm entfällt (z. B. Gutscheine → 15_Gutscheine).
 *   registerSaveFilter(fn)      Ablage anpassen, bevor gespeichert wird (Zielordner, Dateiname, Vermerk)
 *                               fn(plan) mit plan = { job, draft, rel, fileName, description, meta }
 *   registerSavePrepare(fn)     wie ein Ablage-Filter, aber asynchron und nur beim tatsächlichen Ablegen
 *                               (nicht für die Vorschau) – z. B. ein Vorschaubild in plan.meta legen
 *   registerHomeSection(def)    Baustein auf der Startseite: { id, render() → HTML, bind(root) }
 *   registerDraftInit(fn)       Entwurf vorbelegen: fn(draft, job)  (läuft immer, auch für abgeschaltete Module)
 *
 * Jede Anmeldung kann zu einem Funktionsmodul gehören: def.feature = "<id>" bzw. bei Funktionen
 * registerSaveFilter(fn, { feature: "<id>" }). Ist das Modul abgeschaltet (core/features.js),
 * wird die Erweiterung übersprungen.
 *
 * Ein Beispiel für ein vollständiges Modul ist js/features/invoices/.
 */
import { isEnabled } from "./features.js";

const aiFields = [];
const reviewSections = [];
const saveFilters = [];
const savePrepares = [];
const homeSections = [];
const draftInits = [];

const active = (x) => isEnabled(x.feature);

export const registerAiField = (def) => aiFields.push(def);
export const registerReviewSection = (def) => reviewSections.push(def);
export const registerSaveFilter = (fn, { feature } = {}) => saveFilters.push({ fn, feature });
export const registerSavePrepare = (fn, { feature } = {}) => savePrepares.push({ fn, feature });
export const registerHomeSection = (def) => homeSections.push(def);
export const registerDraftInit = (fn) => draftInits.push({ fn });

export const getAiFields = () => aiFields.filter(active);
export const getReviewSections = (job, draft) => reviewSections.filter((s) => active(s) && (!s.applies || s.applies(job, draft)));
export const getHomeSections = () => homeSections.filter(active);

/** Fester Ablageort, wenn ein Prüfen-Abschnitt ihn vorgibt: { rel, note } oder null. */
export function getFixedTarget(job, draft) {
  for (const s of getReviewSections(job, draft)) {
    const rel = s.target?.(job, draft);
    if (rel?.length) return { rel: rel.filter(Boolean), note: s.targetNote || "" };
  }
  return null;
}

export function applySaveFilters(plan) {
  for (const f of saveFilters) if (active(f)) f.fn(plan);
  return plan;
}

export async function applySavePrepares(plan) {
  for (const f of savePrepares) if (active(f)) await f.fn(plan);
  return plan;
}

// Entwürfe werden immer vollständig vorbelegt (auch für abgeschaltete Module) – das ist harmlos und
// verhindert halbe Entwürfe, falls ein Modul während der Bearbeitung eingeschaltet wird.
export function applyDraftInits(draft, job) {
  for (const f of draftInits) f.fn(draft, job);
  return draft;
}
