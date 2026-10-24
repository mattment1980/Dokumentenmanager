/**
 * Erweiterungspunkte – hier docken Funktionsmodule (js/features/…) an, ohne den Kern zu ändern.
 *
 *   registerAiField(def)        zusätzliche Felder, die die KI ausfüllen soll
 *                               def = { name, schema, rule, apply(draft, value, job) }
 *   registerReviewSection(def)  zusätzlicher Abschnitt im Prüfen-Bildschirm
 *                               def = { id, applies(job, draft), render(job, draft) → HTML,
 *                                       bind(root, job, draft, rerender), validate(job, draft) → "" | Meldung }
 *   registerSaveFilter(fn)      Ablage anpassen, bevor gespeichert wird (Zielordner, Dateiname, Vermerk)
 *                               fn(plan) mit plan = { job, draft, rel, fileName, description, meta }
 *   registerHomeSection(def)    Baustein auf der Startseite: { id, render() → HTML, bind(root) }
 *   registerDraftInit(fn)       Entwurf vorbelegen: fn(draft, job)
 *
 * Ein Beispiel für ein vollständiges Modul ist js/features/invoices/.
 */

const aiFields = [];
const reviewSections = [];
const saveFilters = [];
const homeSections = [];
const draftInits = [];

export const registerAiField = (def) => aiFields.push(def);
export const registerReviewSection = (def) => reviewSections.push(def);
export const registerSaveFilter = (fn) => saveFilters.push(fn);
export const registerHomeSection = (def) => homeSections.push(def);
export const registerDraftInit = (fn) => draftInits.push(fn);

export const getAiFields = () => aiFields;
export const getReviewSections = (job, draft) => reviewSections.filter((s) => !s.applies || s.applies(job, draft));
export const getHomeSections = () => homeSections;

export function applySaveFilters(plan) {
  for (const fn of saveFilters) fn(plan);
  return plan;
}

export function applyDraftInits(draft, job) {
  for (const fn of draftInits) fn(draft, job);
  return draft;
}
