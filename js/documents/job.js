/**
 * Dokument-Auftrag ("Job"): eine Einheit, die einmal geprüft und als eine Datei abgelegt wird.
 *
 * Jeder Eingangskanal (Kamera, Dateiauswahl, Teilen, E-Mail …) erzeugt Jobs; ab dann laufen
 * alle durch denselben Ablauf (core/pipeline.js): Weg wählen → Prüfen → Ablegen.
 *
 * Arten (kind):
 *   "scan"     – Seitenbilder; werden zu einem PDF. pages: [{ src, corners, mode, out, thumb, detected }]
 *   "pdf"      – vorhandenes PDF (bytes)
 *   "mailtext" – nur der Text einer E-Mail (oder geteilter Text); wird zu einem PDF
 *   "file"     – sonstige Datei (Word, Excel …); wird unverändert abgelegt
 *
 * Optional hängt an jedem Job die E-Mail, aus der er stammt (mail). Bei "scan" und "pdf"
 * kann deren Text als letzte Seite angehängt werden (appendMail, im Prüfen-Bildschirm umschaltbar).
 *
 * Diese Datei kennt keine Oberfläche. Bildverarbeitung (canvasToJpeg) braucht einen Browser,
 * alles andere läuft auch in Node (Tests).
 */
import { imagesToPdf, loadPdf, mailToPdf, addMailPages, finalize } from "./pdf.js";
import { extOf, mimeFor } from "./filetypes.js";
import { canvasToJpeg, AI_MAX_EDGE } from "./scan.js";

/** PDFs über dieser Größe werden der KI nicht geschickt (nur Begleittext). */
export const AI_PDF_LIMIT = 20 * 1024 * 1024;

let seq = 0;

/**
 * Erzeugt einen Job.
 * @param {object} o
 * @param {"scan"|"pdf"|"mailtext"|"file"} o.kind
 * @param {string} [o.name]      Originaldateiname (oder Betreff bei mailtext)
 * @param {Array}  [o.pages]     nur bei scan
 * @param {Uint8Array} [o.bytes] bei pdf und file
 * @param {string} [o.mime]
 * @param {object} [o.mail]      E-Mail, aus der der Job stammt (siehe importers/mail.js)
 * @param {string} [o.source]    "camera" | "file" | "share" | "drop" | "mail" | "launch"
 * @param {boolean} [o.needsPageReview] Seitenbildschirm vor dem Ablegen zeigen (Kamera, Fotos)
 */
export function createJob({ kind, name = "", pages = [], bytes = null, mime = "", mail = null, source = "file", needsPageReview = false }) {
  const signed = kind === "pdf" && bytes ? isSignedPdf(bytes) : false;
  return {
    id: `j${Date.now().toString(36)}${(seq++).toString(36)}`,
    kind,
    name,
    pages,
    bytes,
    mime: kind === "file" ? mimeFor(name, mime) : "application/pdf",
    ext: kind === "file" ? extOf(name) || "bin" : "pdf",
    mail,
    source,
    needsPageReview,
    signed,
    appendMail: !!mail && (kind === "scan" || (kind === "pdf" && !signed)),
    prepared: null,
    draft: null,
  };
}

/** Kann an diesen Job der Mailtext angehängt werden? */
export const canAppendMail = (job) => !!job.mail && (job.kind === "scan" || (job.kind === "pdf" && !job.signed));

/** Vorbereiten (einmalig, wird zwischengespeichert): JPEGs der Seiten, Eingaben für die KI. */
export async function prepare(job) {
  if (job.prepared) return job.prepared;
  const p = { jpegs: [], aiImages: [], aiPdf: null };
  if (job.kind === "scan") {
    for (const pg of job.pages) {
      const j = await canvasToJpeg(pg.out, 0.78);
      p.jpegs.push({ jpeg: j.bytes, width: j.width, height: j.height });
      const a = await canvasToJpeg(pg.out, 0.82, AI_MAX_EDGE);
      p.aiImages.push(a.bytes);
    }
  } else if (job.kind === "pdf" && job.bytes.length <= AI_PDF_LIMIT) {
    p.aiPdf = job.bytes;
  }
  job.prepared = p;
  return p;
}

/** Nach Änderungen an den Seiten aufrufen. */
export function invalidate(job) {
  job.prepared = null;
}

/** Eingaben für ai.suggest(). */
export async function aiInput(job) {
  const p = await prepare(job);
  return {
    images: p.aiImages,
    pdf: p.aiPdf,
    text: job.mail ? mailAsText(job.mail) : "",
    fileName: job.kind === "file" || job.kind === "pdf" ? job.name : "",
  };
}

/**
 * Baut die Datei, die abgelegt wird.
 * @param {object} meta { title, author, subject, keywords } – PDF-Metadaten
 * @returns {{ bytes: Uint8Array, mime: string, ext: string, note: string }}
 */
export async function buildFinal(job, meta = {}) {
  const withMail = job.appendMail && canAppendMail(job);
  if (job.kind === "scan") {
    const p = await prepare(job);
    const doc = await imagesToPdf(p.jpegs);
    if (withMail) await addMailPages(doc, job.mail);
    return { bytes: await finalize(doc, meta), mime: "application/pdf", ext: "pdf", note: "" };
  }
  if (job.kind === "mailtext") {
    const doc = await mailToPdf(job.mail);
    return { bytes: await finalize(doc, meta), mime: "application/pdf", ext: "pdf", note: "" };
  }
  if (job.kind === "pdf") {
    // Originale nur anfassen, wenn wirklich etwas angehängt wird (Signaturen, PDF/A bleiben sonst erhalten).
    if (!withMail) return { bytes: job.bytes, mime: "application/pdf", ext: "pdf", note: "" };
    const doc = await loadPdf(job.bytes);
    if (!doc) {
      return { bytes: job.bytes, mime: "application/pdf", ext: "pdf", note: "Das PDF ist geschützt; der Mailtext konnte nicht angehängt werden." };
    }
    await addMailPages(doc, job.mail);
    return { bytes: await finalize(doc, meta), mime: "application/pdf", ext: "pdf", note: "" };
  }
  return { bytes: job.bytes, mime: job.mime, ext: job.ext, note: "" };
}

/** Kurzbeschreibung für die Oberfläche. */
export function describe(job) {
  const n = job.pages?.length || 0;
  switch (job.kind) {
    case "scan":
      return { title: job.name || `${n} Seite${n === 1 ? "" : "n"}`, kind: job.source === "camera" ? "Scan" : "Bild" };
    case "pdf":
      return { title: job.name || "PDF", kind: job.signed ? "PDF (digital signiert)" : "PDF" };
    case "mailtext":
      return { title: job.mail?.subject || job.name || "E-Mail", kind: "E-Mail-Text" };
    default:
      return { title: job.name || "Datei", kind: `${(job.ext || "").toUpperCase()}-Datei` };
  }
}

/** Datum für "Direkt ablegen": Datum der E-Mail, sonst leer (dann setzt die Oberfläche heute). */
export function defaultDate(job) {
  const d = job.mail?.date;
  if (!(d instanceof Date) || isNaN(d)) return "";
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** E-Mail als Klartext (Kontext für die KI). */
export function mailAsText(mail) {
  const head = [
    mail.from && `Von: ${mail.from}`,
    mail.to && `An: ${mail.to}`,
    mail.date instanceof Date && !isNaN(mail.date) && `Datum: ${mail.date.toISOString().slice(0, 10)}`,
    mail.subject && `Betreff: ${mail.subject}`,
    mail.attachmentNames?.length && `Anhänge: ${mail.attachmentNames.join(", ")}`,
  ].filter(Boolean);
  return `${head.join("\n")}\n\n${mail.text || ""}`.trim();
}

/** Digital signierte PDFs erkennt man am Signaturfeld (/ByteRange). */
export function isSignedPdf(bytes) {
  const n = bytes.length;
  // Signaturen stehen meist am Dateiende; zur Sicherheit wird alles durchsucht (schnell, ohne Kopie).
  const pat = [47, 66, 121, 116, 101, 82, 97, 110, 103, 101]; // "/ByteRange"
  outer: for (let i = 0; i <= n - pat.length; i++) {
    if (bytes[i] !== 47) continue;
    for (let k = 1; k < pat.length; k++) if (bytes[i + k] !== pat[k]) continue outer;
    return true;
  }
  return false;
}
