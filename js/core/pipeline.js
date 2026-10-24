/**
 * Der zentrale Ablage-Ablauf – für alle Eingangskanäle gleich.
 *
 *   startBatch(jobs)                         ← Importer liefern einen oder mehrere Jobs
 *     └─ je Job: [pages] → route → review → saveCurrent() → nächster Job
 *   nach dem letzten Job: Bildschirm "done" mit allen Ergebnissen
 *
 * Ein Job hat dabei einen Entwurf (job.draft) mit den Ablagedaten:
 *   { date, doctype, folder, subfolder, sender, title, ai, aiPending, aiError, dateFromAi }
 *
 * Erweiterungen hängen sich über Ereignisse (core/events.js, z. B. "document:saved") und
 * Erweiterungspunkte (core/extensions.js: KI-Felder, Prüfen-Abschnitte, Ablage-Filter) an.
 */
import { APP } from "./config.js";
import { S, clone, folderByName, doctypeByName, uploaderName } from "./state.js";
import { go, setStack, resetTo, isCurrent, render } from "./router.js";
import { busy, unbusy, toast, errText } from "./ui.js";
import { archiveLabel } from "./archive.js";
import { enqueue, processQueue } from "./uploader.js";
import { emit } from "./events.js";
import { getAiFields, getReviewSections, applySaveFilters, applyDraftInits } from "./extensions.js";
import { settings, queue } from "../services/storage.js";
import * as ai from "../services/ai.js";
import { aiInput, buildFinal, defaultDate, describe, AI_PDF_LIMIT } from "../documents/job.js";
import { buildFileName, todayIso, isValidIsoDate } from "../documents/naming.js";

// ---------- Stapel ----------

/** Startet die Bearbeitung eines oder mehrerer Jobs. */
export function startBatch(jobs) {
  if (!jobs.length) return;
  S.batch = { jobs, index: 0, results: [] };
  S.mailImport = null;
  openCurrent();
}

/** Position im Stapel, z. B. für "Dokument 2 von 3". */
export function batchInfo() {
  return S.batch ? { index: S.batch.index, total: S.batch.jobs.length } : { index: 0, total: 0 };
}

function openCurrent() {
  S.job = S.batch.jobs[S.batch.index];
  setStack(["home", S.job.needsPageReview ? "pages" : "route"]);
}

function advance() {
  S.batch.index++;
  if (S.batch.index < S.batch.jobs.length) return openCurrent();
  S.lastResults = S.batch.results;
  S.batch = null;
  S.job = null;
  setStack(["home", "done"]);
}

/** Aktuelles Dokument überspringen (wird nicht abgelegt). */
export function skipCurrent() {
  S.batch.results.push({ skipped: true, title: describe(S.job).title });
  advance();
}

/** Ganzen Stapel abbrechen. */
export function cancelBatch() {
  S.batch = null;
  S.job = null;
  resetTo("home");
}

// ---------- Weg wählen ----------

/** Kann die KI für diesen Job einen Vorschlag machen (unabhängig vom Schlüssel)? */
export function aiPossible(job) {
  if (job.kind === "scan" || job.kind === "mailtext") return true;
  if (job.kind === "pdf") return job.bytes.length <= AI_PDF_LIMIT || !!job.mail;
  return !!job.mail; // sonstige Dateien: nur über den Mailtext
}

export function hasApiKey() {
  return !!settings.get("apiKey", "");
}

function newDraft(job) {
  const d = {
    date: defaultDate(job) || todayIso(),
    doctype: "",
    folder: "",
    subfolder: "",
    sender: "",
    title: job.kind === "mailtext" && job.mail?.subject ? job.mail.subject.slice(0, 60) : "",
    ai: null,
    aiPending: false,
    aiError: "",
    dateFromAi: false,
  };
  return applyDraftInits(d, job);
}

export function startDirect() {
  S.job.draft = newDraft(S.job);
  go("review");
}

export function startAi() {
  const job = S.job;
  job.draft = newDraft(job);
  job.draft.aiPending = true;
  go("review");
  runAi(job);
}

/** Wechsel vom laufenden KI-Vorschlag zum direkten Ablegen. */
export function abortAi() {
  S.job.draft = newDraft(S.job);
}

async function runAi(job) {
  const d = job.draft;
  try {
    const input = await aiInput(job);
    const sug = await ai.suggest({
      key: settings.get("apiKey", ""),
      model: settings.get("model", APP.defaultModel),
      structure: S.structure,
      ...input,
      extraFields: getAiFields().map(({ name, schema, rule }) => ({ name, schema, rule })),
      today: todayIso(),
    });
    if (job.draft !== d) return;
    Object.assign(d, {
      ai: sug,
      folder: sug.folder,
      subfolder: sug.subfolder,
      doctype: sug.doctype,
      sender: sug.sender,
      title: sug.title,
      date: sug.date || d.date,
      dateFromAi: !!sug.date,
    });
    for (const f of getAiFields()) {
      try {
        f.apply(d, sug.raw?.[f.name], job);
      } catch (e) {
        console.warn(`KI-Feld ${f.name}`, e);
      }
    }
  } catch (e) {
    if (job.draft !== d) return;
    d.aiError = errText(e);
  }
  d.aiPending = false;
  if (S.job === job && isCurrent("review")) render();
}

// ---------- Prüfen ----------

/** Gibt eine Meldung zurück, was noch fehlt, oder "" wenn alles passt. */
export function validate(d) {
  if (!d.doctype) return "Bitte Dokumenttyp wählen.";
  if (!d.folder) return "Bitte Ordner wählen.";
  const f = folderByName(d.folder);
  if (f && f.children && f.children.length && !d.subfolder) return "Bitte Unterordner wählen.";
  if (!isValidIsoDate(d.date)) return "Bitte gültiges Datum eingeben.";
  if (!d.sender.trim()) return "Bitte Absender eintragen.";
  if (!d.title.trim()) return "Bitte Titel eintragen.";
  return "";
}

/** Prüft Grunddaten und alle Zusatzabschnitte der Erweiterungen. */
export function validateAll(job, d) {
  return validate(d) || getReviewSections(job, d).map((sec) => sec.validate?.(job, d) || "").find(Boolean) || "";
}

export function fileNameFor(job, d) {
  const dt = doctypeByName(d.doctype);
  return buildFileName({ date: d.date, sender: d.sender, doctypeShort: dt ? dt.short : "", title: d.title, ext: job.ext });
}

/**
 * Ablageplan: wohin, unter welchem Namen, mit welchem Vermerk.
 * Erweiterungen können ihn über Ablage-Filter ändern (z. B. unbezahlte Rechnungen in einen Eingangsordner).
 * meta wird mit dem Upload gespeichert und nach erfolgreichem Hochladen im Ereignis "queue:uploaded" mitgegeben.
 */
export function planSave(job, d) {
  const who = uploaderName();
  return applySaveFilters({
    job,
    draft: d,
    who,
    rel: [d.folder, d.subfolder].filter(Boolean),
    fileName: fileNameFor(job, d),
    description: `Abgelegt von: ${who} am ${new Date().toLocaleDateString("de-DE")} · Dokumenttyp: ${d.doctype} · Absender: ${String(d.sender || "").trim()}`,
    meta: {},
  });
}

export function targetPath(job, d) {
  const rel = d.folder ? planSave(job, d).rel : ["…"];
  return [archiveLabel(), ...rel].join(" / ");
}

// ---------- Ablegen ----------

/** Baut die Datei, stellt sie in die Warteschlange, lädt hoch und geht zum nächsten Job. */
export async function saveCurrent() {
  const job = S.job;
  const d = job.draft;
  if (validateAll(job, d)) return;
  const plan = planSave(job, d);
  const { rel, fileName, description, who } = plan;
  busy("Wird abgelegt …");
  try {
    const out = await buildFinal(job, {
      title: `${d.sender.trim()} – ${d.title.trim()}`,
      author: who,
      subject: `${d.doctype} · Abgelegt von ${who}`,
      keywords: [d.doctype, d.folder, d.subfolder, d.sender].filter(Boolean).join(", "),
    });
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await enqueue({ id, created: Date.now(), rel, archive: clone(S.archive), fileName, bytes: out.bytes, mime: out.mime, description, meta: clone(plan.meta) });
    const done = navigator.onLine ? await processQueue() : new Map();
    const res = done.get(id);
    const queued = !res && (await queue.all()).some((q) => q.id === id);
    const result = {
      fileName: res ? res.name : fileName,
      path: [archiveLabel(), ...rel].join(" / "),
      webUrl: res ? res.webUrl : null,
      queued,
      authProblem: S.authProblem,
      note: out.note,
    };
    S.batch.results.push(result);
    emit("document:saved", { job, draft: clone({ ...d, ai: null }), result, archive: clone(S.archive), rel });
    unbusy();
    if (out.note) toast(out.note, 6000);
    advance();
  } catch (e) {
    unbusy();
    toast("Ablegen fehlgeschlagen: " + errText(e), 6000);
  }
}
