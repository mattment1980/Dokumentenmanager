/**
 * E-Mail-Dateien einlesen: .eml (Standard, z. B. GMX, neues Outlook) und .msg (Outlook classic).
 *
 * Ergebnis ist immer dasselbe, vom Format unabhängige Mail-Objekt:
 *   {
 *     from, to, cc: string            – "Name <adresse>", mehrere mit Komma
 *     date: Date | null
 *     subject: string
 *     text: string                    – Klartext (HTML wird in Text umgewandelt, nie ausgeführt)
 *     attachments: [{ name, mime, bytes: Uint8Array, inline: boolean, kind }]
 *     attachmentNames: string[]       – sichtbare Anhänge (für die Mailtext-Seite)
 *   }
 *
 * inline = eingebettete Bilder (Logos, Signaturen) – werden standardmäßig nicht abgelegt.
 * kind   = Verarbeitungsart aus documents/filetypes.js (null = nicht unterstützt).
 *
 * Läuft im Browser und in Node (Tests); HTML-Umwandlung nutzt im Browser DOMParser.
 */
import PostalMime from "../../vendor/postal-mime.esm.js";
import MsgReader from "../../vendor/msgreader.esm.js";
import { classify, extOf } from "../documents/filetypes.js";

/** Liest .eml oder .msg anhand der Endung bzw. des Inhalts. */
export async function parseMailFile(name, bytes) {
  const isMsg = extOf(name) === "msg" || isOleFile(bytes);
  return isMsg ? parseMsg(bytes) : parseEml(bytes);
}

// ---------- .eml ----------

export async function parseEml(bytes) {
  const e = await PostalMime.parse(bytes);
  const atts = (e.attachments || []).map((a) => {
    const name = a.filename || guessName(a.mimeType);
    const inline = a.disposition === "inline" && !!a.contentId && String(a.mimeType || "").startsWith("image/");
    return makeAttachment(name, a.mimeType, new Uint8Array(a.content), inline);
  });
  return finish({
    from: addr(e.from),
    to: (e.to || []).map(addr).join(", "),
    cc: (e.cc || []).map(addr).join(", "),
    date: e.date ? new Date(e.date) : null,
    subject: e.subject || "",
    text: e.text && e.text.trim() ? e.text : htmlToText(e.html || ""),
    attachments: atts,
  });
}

// ---------- .msg ----------

export async function parseMsg(bytes) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const reader = new MsgReader(ab);
  const d = reader.getFileData();
  if (d.error) throw new Error("Outlook-Datei konnte nicht gelesen werden.");
  const rec = d.recipients || [];
  const who = (r) => (r.smtpAddress || r.email ? `${r.name || ""} <${r.smtpAddress || r.email}>`.trim() : r.name || "");
  const atts = [];
  for (const a of d.attachments || []) {
    if (a.innerMsgContent) continue; // weitergeleitete Mail als Anhang: wird (noch) nicht zerlegt
    let content;
    try {
      content = reader.getAttachment(a).content;
    } catch {
      continue;
    }
    const name = a.fileName || a.fileNameShort || a.name || guessName(a.attachMimeTag);
    const mime = a.attachMimeTag || "";
    const inline = !!a.attachmentHidden || (!!a.pidContentId && (mime.startsWith("image/") || classify(name) === "image"));
    atts.push(makeAttachment(name, mime, new Uint8Array(content), inline));
  }
  const dateStr = d.messageDeliveryTime || d.clientSubmitTime || d.creationTime || "";
  let text = d.body || "";
  if (!text.trim() && d.bodyHtml) text = htmlToText(d.bodyHtml);
  return finish({
    from: d.senderSmtpAddress || d.senderEmail ? `${d.senderName || ""} <${d.senderSmtpAddress || d.senderEmail}>`.trim() : d.senderName || "",
    to: rec.filter((r) => (r.recipType || "to") === "to").map(who).join(", "),
    cc: rec.filter((r) => r.recipType === "cc").map(who).join(", "),
    date: dateStr ? new Date(dateStr) : null,
    subject: d.subject || "",
    text,
    attachments: atts,
  });
}

// ---------- Hilfen ----------

function makeAttachment(name, mime, bytes, inline) {
  return { name: name || "Anhang", mime: mime || "", bytes, inline, kind: classify(name, mime) };
}

function finish(m) {
  if (m.date && isNaN(m.date)) m.date = null;
  m.text = normalizeText(m.text || "");
  m.attachmentNames = m.attachments.filter((a) => !a.inline).map((a) => a.name);
  return m;
}

const addr = (a) => (a ? (a.name && a.address ? `${a.name} <${a.address}>` : a.address || a.name || "") : "");

function guessName(mime) {
  const ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[String(mime || "").toLowerCase()];
  return ext ? `Anhang.${ext}` : "Anhang";
}

/** OLE-Verbunddatei (Format von .msg) an den ersten Bytes erkennen. */
function isOleFile(b) {
  return b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
}

function normalizeText(t) {
  return String(t)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * HTML einer Mail in lesbaren Text umwandeln.
 * DOMParser erzeugt ein inaktives Dokument: Skripte laufen nicht, Bilder werden nicht geladen.
 */
export function htmlToText(html) {
  if (!html) return "";
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,head,title,noscript").forEach((n) => n.remove());
    doc.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
    doc.querySelectorAll("p,div,li,tr,h1,h2,h3,h4,h5,h6,blockquote,table").forEach((n) => n.append("\n"));
    doc.querySelectorAll("td,th").forEach((n) => n.append("\t"));
    return normalizeText((doc.body?.textContent || "").replace(/\t+/g, "  ").replace(/ /g, " "));
  }
  // Fallback ohne DOM (Tests in Node)
  return normalizeText(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"'),
  );
}
