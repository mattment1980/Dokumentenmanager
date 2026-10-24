/**
 * Welche Dateien kann die App verarbeiten, und wie?
 *
 *   "pdf"   – wird als PDF abgelegt (Mailtext kann angehängt werden)
 *   "image" – Foto/Bild, wird zu PDF umgewandelt
 *   "mail"  – E-Mail-Datei (.eml, .msg), wird zerlegt in Anhänge und Mailtext
 *   "file"  – Office- und Textdateien, werden im Original abgelegt
 *   null    – nicht unterstützt
 *
 * Neue Formate: hier eintragen und, falls sie eine eigene Verarbeitung brauchen,
 * in importers/index.js einen Zweig ergänzen. Die Liste der Endungen wird auch für das
 * Teilen-Menü (manifest.webmanifest) und "Öffnen mit" gebraucht – dort ebenfalls pflegen.
 *
 * Reine Funktionen – in tests/unit/filetypes.test.mjs abgedeckt.
 */

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];
const MAIL_EXT = ["eml", "msg"];
const FILE_EXT = ["doc", "docx", "xls", "xlsx", "odt", "ods", "odp", "ppt", "pptx", "rtf", "txt", "csv"];

const MIME_BY_EXT = {
  pdf: "application/pdf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
  eml: "message/rfc822", msg: "application/vnd.ms-outlook",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  rtf: "application/rtf", txt: "text/plain", csv: "text/csv",
};

/** Endung einer Datei in Kleinbuchstaben, ohne Punkt ("" wenn keine). */
export function extOf(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return m ? m[1] : "";
}

/** Ordnet eine Datei einer Verarbeitungsart zu (siehe Kopfkommentar). */
export function classify(name, mime = "") {
  const ext = extOf(name);
  const m = String(mime || "").toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (MAIL_EXT.includes(ext) || m === "message/rfc822" || m === "application/vnd.ms-outlook") return "mail";
  if (IMAGE_EXT.includes(ext) || (m.startsWith("image/") && !["image/heic", "image/heif", "image/svg+xml"].includes(m))) return "image";
  if (FILE_EXT.includes(ext)) return "file";
  return null;
}

/** MIME-Typ für den Upload (Fallback: aus der Endung, sonst generisch). */
export function mimeFor(name, mime = "") {
  if (mime && mime !== "application/octet-stream") return mime;
  return MIME_BY_EXT[extOf(name)] || "application/octet-stream";
}

/** Endungen für den Dateiauswahl-Dialog (accept-Attribut). */
export const ACCEPT_ATTR = ["application/pdf", "image/*", ...[...MAIL_EXT, ...FILE_EXT].map((e) => "." + e)].join(",");
