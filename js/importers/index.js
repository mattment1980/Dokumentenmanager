/**
 * Zentrale Annahmestelle für alles, was in die App hineinkommt.
 *
 * Eingangskanäle (importers/sources.js: Kamera, Dateiauswahl, Hineinziehen, Teilen, "Öffnen mit")
 * übergeben Dateien an importFiles(). Hier wird entschieden, welche Jobs entstehen:
 *
 *   Fotos/Bilder         → ein gemeinsamer Scan-Job (mehrseitig), mit Seitenbildschirm
 *   PDF                  → je Datei ein PDF-Job
 *   Office-/Textdateien  → je Datei ein Datei-Job (Ablage im Original)
 *   E-Mail (.eml/.msg)   → einzeln: Auswahlbildschirm "mail"; mehrere: alle Anhänge automatisch
 *   geteilter Text       → ein Mailtext-Job
 *
 * Neuer Eingangskanal = neue Quelle in sources.js, die importFiles()/importText() aufruft.
 */
import { S } from "../core/state.js";
import { go } from "../core/router.js";
import { busy, busyText, unbusy, toast, errText } from "../core/ui.js";
import { startBatch } from "../core/pipeline.js";
import { createJob, invalidate } from "../documents/job.js";
import { classify } from "../documents/filetypes.js";
import { loadImage, makePage } from "../documents/scan.js";
import { parseMailFile } from "./mail.js";

/**
 * Nimmt Dateien entgegen und startet die Bearbeitung.
 * @param {File[]} files
 * @param {{source?: string}} opts  source: "camera" | "file" | "share" | "drop" | "launch"
 */
export async function importFiles(files, { source = "file" } = {}) {
  files = [...files].filter(Boolean);
  if (!files.length) return;
  const groups = { image: [], pdf: [], file: [], mail: [], none: [] };
  for (const f of files) groups[classify(f.name, f.type) || "none"].push(f);

  if (groups.none.length) {
    toast(`Nicht unterstützt: ${groups.none.map((f) => f.name).join(", ")}`, 6000);
  }

  // Genau eine E-Mail mit mehreren Anhängen: im Auswahlbildschirm wählen lassen.
  // Mit keinem oder einem Anhang geht es ohne Zwischenschritt direkt weiter (weniger Klicks).
  if (groups.mail.length === 1 && files.length - groups.none.length === 1) {
    busy("E-Mail wird gelesen …");
    try {
      const mail = await readMail(groups.mail[0]);
      const picks = defaultPicks(mail);
      if (picks.length > 1) {
        S.mailImport = { mail, source, picks, textDoc: false };
        unbusy();
        go("mail");
        return;
      }
      const jobs = await jobsFromMail(mail, picks, { textDoc: !picks.length });
      unbusy();
      startBatch(jobs);
    } catch (e) {
      unbusy();
      toast(`E-Mail konnte nicht gelesen werden: ${errText(e)}`, 6000);
    }
    return;
  }

  busy("Wird eingelesen …");
  const jobs = [];
  try {
    if (groups.image.length) {
      busyText(groups.image.length > 1 ? "Bilder werden verarbeitet …" : "Bild wird verarbeitet …");
      const pages = await imagesToPages(groups.image, { camera: source === "camera" });
      jobs.push(createJob({ kind: "scan", pages, source, needsPageReview: true, name: groups.image.length === 1 ? groups.image[0].name : "" }));
    }
    for (const f of groups.pdf) jobs.push(createJob({ kind: "pdf", name: f.name, bytes: await bytesOf(f), source }));
    for (const f of groups.file) jobs.push(createJob({ kind: "file", name: f.name, mime: f.type, bytes: await bytesOf(f), source }));
    for (const f of groups.mail) {
      busyText(`E-Mail „${f.name}“ wird gelesen …`);
      const mail = await readMail(f);
      const picks = defaultPicks(mail);
      jobs.push(...(await jobsFromMail(mail, picks, { textDoc: !picks.length })));
    }
  } catch (e) {
    unbusy();
    toast(`Einlesen fehlgeschlagen: ${errText(e)}`, 6000);
    return;
  }
  unbusy();
  if (jobs.length) startBatch(jobs);
}

/** Geteilter Text ohne Datei (z. B. aus einer App, die nur Text teilen kann). */
export function importText({ title = "", text = "", url = "" }, { source = "share" } = {}) {
  const body = [text, url].filter(Boolean).join("\n\n").trim();
  if (!body && !title) return;
  const mail = { from: "", to: "", cc: "", date: new Date(), subject: title || "Geteilter Text", text: body, attachments: [], attachmentNames: [] };
  startBatch([createJob({ kind: "mailtext", name: mail.subject, mail, source })]);
}

/** Weitere Fotos zu einem bestehenden Scan-Job hinzufügen (Seitenbildschirm). */
export async function addImagesToJob(job, files, { camera = false } = {}) {
  const imgs = [...files].filter((f) => classify(f.name, f.type) === "image");
  if (imgs.length < files.length) toast("Hier können nur Fotos/Bilder ergänzt werden.");
  if (!imgs.length) return;
  busy(imgs.length > 1 ? "Bilder werden verarbeitet …" : "Bild wird verarbeitet …");
  try {
    job.pages.push(...(await imagesToPages(imgs, { camera })));
    invalidate(job);
  } catch (e) {
    toast(`Bild konnte nicht verarbeitet werden: ${errText(e)}`, 5000);
  } finally {
    unbusy();
  }
}

/**
 * Jobs aus einer E-Mail.
 * @param {number[]} picks   Indizes der Anhänge, die abgelegt werden sollen
 * @param {{textDoc: boolean}} opts  Mailtext zusätzlich als eigenes Dokument ablegen
 */
export async function jobsFromMail(mail, picks, { textDoc = false } = {}) {
  const jobs = [];
  for (const i of picks) {
    const a = mail.attachments[i];
    if (!a || !a.kind) continue;
    if (a.kind === "pdf") jobs.push(createJob({ kind: "pdf", name: a.name, bytes: a.bytes, mail, source: "mail" }));
    else if (a.kind === "file") jobs.push(createJob({ kind: "file", name: a.name, mime: a.mime, bytes: a.bytes, mail, source: "mail" }));
    else if (a.kind === "image") {
      const file = new File([a.bytes], a.name, { type: a.mime || "image/jpeg" });
      const pages = await imagesToPages([file], { camera: false });
      jobs.push(createJob({ kind: "scan", name: a.name, pages, mail, source: "mail" }));
    } else if (a.kind === "mail") {
      // Weitergeleitete Mail als Anhang: deren Text als eigenes Dokument
      const inner = await parseMailFile(a.name, a.bytes);
      jobs.push(createJob({ kind: "mailtext", name: inner.subject, mail: inner, source: "mail" }));
    }
  }
  if (textDoc) jobs.push(createJob({ kind: "mailtext", name: mail.subject, mail, source: "mail" }));
  return jobs;
}

/** Vorauswahl: alle verarbeitbaren, nicht eingebetteten Anhänge. */
export function defaultPicks(mail) {
  return mail.attachments.map((a, i) => (a.kind && !a.inline ? i : -1)).filter((i) => i >= 0);
}

// ---------- Hilfen ----------

async function bytesOf(file) {
  return new Uint8Array(await file.arrayBuffer());
}

async function readMail(file) {
  return parseMailFile(file.name, await bytesOf(file));
}

async function imagesToPages(files, { camera }) {
  const pages = [];
  for (const [i, f] of files.entries()) {
    if (files.length > 1) busyText(`Bild ${i + 1} von ${files.length} wird verarbeitet …`);
    pages.push(makePage(await loadImage(f), { camera }));
  }
  return pages;
}
