// Dateitypen: welche Datei wird wie verarbeitet?
import test from "node:test";
import assert from "node:assert/strict";
import { classify, extOf, mimeFor } from "../../js/documents/filetypes.js";

test("Zuordnung nach Endung und MIME-Typ", () => {
  assert.equal(classify("Rechnung.PDF"), "pdf");
  assert.equal(classify("x", "application/pdf"), "pdf");
  assert.equal(classify("foto.jpg"), "image");
  assert.equal(classify("scan", "image/png"), "image");
  assert.equal(classify("mail.msg"), "mail");
  assert.equal(classify("mail.eml"), "mail");
  assert.equal(classify("Vertrag.docx"), "file");
  assert.equal(classify("programm.exe"), null);
  assert.equal(classify("bild.heic", "image/heic"), null);
});

test("Endung und MIME-Fallback", () => {
  assert.equal(extOf("a.b.XLSX"), "xlsx");
  assert.equal(extOf("ohne"), "");
  assert.equal(mimeFor("a.docx", "application/octet-stream"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
});
