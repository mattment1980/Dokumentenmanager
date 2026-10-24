// PDF: Mailtext-Seite anhängen, Mailtext-Dokument, signierte PDFs bleiben unverändert
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PDFDocument } from "../../vendor/pdf-lib.esm.min.js";
import { parseMailFile } from "../../js/importers/mail.js";
import { createJob, buildFinal, isSignedPdf } from "../../js/documents/job.js";

const FX = new URL("../fixtures/", import.meta.url).pathname;
const pages = async (bytes) => (await PDFDocument.load(bytes)).getPageCount();

test("Mailtext wird als letzte Seite angehängt (abschaltbar)", async () => {
  const m = await parseMailFile("rechnung-mit-anhang.eml", new Uint8Array(fs.readFileSync(FX + "rechnung-mit-anhang.eml")));
  const a = m.attachments.find((x) => x.kind === "pdf");
  const job = createJob({ kind: "pdf", name: a.name, bytes: a.bytes, mail: m, source: "mail" });
  assert.equal(job.appendMail, true);
  const withMail = await buildFinal(job, { title: "Test", author: "A", subject: "S", keywords: "Rechnung, 00_Eingang, Stadtwerke" });
  assert.equal(await pages(withMail.bytes), (await pages(a.bytes)) + 1);
  job.appendMail = false;
  const without = await buildFinal(job, {});
  assert.equal(without.bytes, a.bytes, "ohne Mailtext bleibt das Original unverändert");
});

test("Mailtext-Dokument mit Sonderzeichen (Emoji) bricht nicht ab", async () => {
  const m = await parseMailFile("zwei-anhaenge.eml", new Uint8Array(fs.readFileSync(FX + "zwei-anhaenge.eml")));
  const job = createJob({ kind: "mailtext", name: m.subject, mail: m });
  const out = await buildFinal(job, {});
  assert.equal(await pages(out.bytes), 1);
});

test("Office-Dateien werden im Original abgelegt", async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
  const job = createJob({ kind: "file", name: "Preisliste.docx", bytes });
  const out = await buildFinal(job, {});
  assert.equal(out.bytes, bytes);
  assert.equal(out.ext, "docx");
});

test("Digital signierte PDFs werden erkannt und nicht verändert", async () => {
  const signed = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Sig /ByteRange [0 10 20 30] >> endobj\n%%EOF");
  assert.equal(isSignedPdf(signed), true);
  const job = createJob({ kind: "pdf", name: "x.pdf", bytes: signed, mail: { text: "x", attachmentNames: [] } });
  assert.equal(job.appendMail, false);
  assert.equal((await buildFinal(job, {})).bytes, signed);
});
