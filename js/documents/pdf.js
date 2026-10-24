/**
 * PDF erzeugen und erweitern (mit der Bibliothek pdf-lib, liegt in vendor/).
 *
 *   imagesToPdf(pages)          – fotografierte Seiten (JPEG) zu einem PDF
 *   loadPdf(bytes)              – vorhandenes PDF öffnen (null, wenn nicht lesbar/verschlüsselt)
 *   mailToPdf(mail)             – nur die Mailtext-Seite(n)
 *   addMailPages(doc, mail)     – Mailtext-Seite(n) hinten anfügen
 *   finalize(doc, meta)         – Titel/Autor/Stichworte setzen und speichern → Uint8Array
 *
 * Läuft im Browser und in Node (Tests). Ohne Seiteneffekte auf den App-Zustand.
 */
import { PDFDocument, StandardFonts, rgb } from "../../vendor/pdf-lib.esm.min.js";

const A4 = [595.28, 841.89];
const MARGIN = 50;

/** Seiten aus JPEG-Bildern: pages = [{ jpeg: Uint8Array, width, height }] */
export async function imagesToPdf(pages) {
  const doc = await PDFDocument.create();
  for (const pg of pages) {
    const img = await doc.embedJpg(pg.jpeg);
    const landscape = pg.width > pg.height;
    const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
    const scale = Math.min(pw / img.width, ph / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = doc.addPage([pw, ph]);
    page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return doc;
}

/** Öffnet ein PDF. Gibt null zurück, wenn es nicht verarbeitet werden kann (dann Original ablegen). */
export async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    return null;
  }
}

export async function mailToPdf(mail) {
  const doc = await PDFDocument.create();
  await addMailPages(doc, mail);
  return doc;
}

/**
 * Hängt die E-Mail als lesbare Seite(n) an: Kopf (Von, An, Datum, Betreff, Anhänge) und Text.
 * mail: { from, to, cc, date (Date|null), subject, text, attachmentNames: string[] }
 */
export async function addMailPages(doc, mail) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSanitizer(font);
  const size = 10;
  const lh = 13.5;
  const maxW = A4[0] - 2 * MARGIN;

  let page = null;
  let y = 0;
  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const line = (text, f = font, sz = size, color = rgb(0.1, 0.12, 0.15)) => {
    if (y < MARGIN + lh) newPage();
    page.drawText(text, { x: MARGIN, y: y - sz, size: sz, font: f, color });
    y -= lh * (sz / size);
  };

  newPage();
  line("E-Mail", bold, 14);
  y -= 4;
  const head = [
    ["Von", mail.from],
    ["An", mail.to],
    ["Cc", mail.cc],
    ["Datum", mail.date ? formatDate(mail.date) : ""],
    ["Betreff", mail.subject],
    ["Anhänge", (mail.attachmentNames || []).join(", ")],
  ].filter(([, v]) => v && String(v).trim());
  for (const [k, v] of head) {
    const label = `${k}: `;
    const lw = bold.widthOfTextAtSize(label, size);
    const rows = wrap(safe(String(v)), font, size, maxW - lw);
    rows.forEach((r, i) => {
      if (y < MARGIN + lh) newPage();
      if (i === 0) page.drawText(label, { x: MARGIN, y: y - size, size, font: bold, color: rgb(0.1, 0.12, 0.15) });
      page.drawText(r, { x: MARGIN + lw, y: y - size, size, font, color: rgb(0.1, 0.12, 0.15) });
      y -= lh;
    });
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
  y -= 12;

  const body = safe(String(mail.text || "").trim() || "(Kein Text)");
  for (const para of body.split("\n")) {
    const rows = para.trim() ? wrap(para, font, size, maxW) : [""];
    for (const r of rows) line(r);
  }
  return doc;
}

/** Metadaten setzen und als Bytes speichern. */
export async function finalize(doc, meta = {}) {
  if (meta.title) doc.setTitle(meta.title);
  if (meta.author) doc.setAuthor(meta.author);
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords) doc.setKeywords(Array.isArray(meta.keywords) ? meta.keywords : String(meta.keywords).split(/\s*,\s*/).filter(Boolean));
  doc.setCreator("Dokumentenmanager");
  doc.setProducer("Dokumentenmanager");
  return await doc.save();
}

// ---------- Hilfen ----------

function formatDate(d) {
  try {
    return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(d);
  }
}

/**
 * Die Standardschrift kann nur westeuropäische Zeichen (WinAnsi). Alles andere (Emojis,
 * asiatische Schriften …) wird ersetzt, damit die PDF-Erzeugung nie abbricht.
 */
function makeSanitizer(font) {
  const ok = new Set(font.getCharacterSet());
  const map = { " ": "\n", " ": "\n", "\t": "    ", " ": " ", "​": "", "﻿": "", "­": "" };
  return (s) => {
    let out = "";
    for (const ch of s.replace(/\r\n?/g, "\n")) {
      if (ch === "\n") out += ch;
      else if (ch in map) out += map[ch];
      else if (ok.has(ch.codePointAt(0))) out += ch;
      else out += "?";
    }
    return out;
  };
}

/** Bricht Text auf die verfügbare Breite um (lange Wörter werden hart getrennt). */
function wrap(text, font, size, maxW) {
  const words = text.split(/ +/);
  const rows = [];
  let cur = "";
  const fits = (s) => font.widthOfTextAtSize(s, size) <= maxW;
  for (let w of words) {
    const cand = cur ? cur + " " + w : w;
    if (fits(cand)) {
      cur = cand;
      continue;
    }
    if (cur) rows.push(cur);
    while (!fits(w) && w.length > 1) {
      let i = w.length - 1;
      while (i > 1 && !fits(w.slice(0, i))) i--;
      rows.push(w.slice(0, i));
      w = w.slice(i);
    }
    cur = w;
  }
  rows.push(cur);
  return rows;
}
