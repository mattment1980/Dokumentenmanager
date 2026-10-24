// E-Mail-Import: .eml (immer) und .msg (nur wenn lokale Beispieldateien vorhanden sind)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseMailFile } from "../../js/importers/mail.js";

const FX = new URL("../fixtures/", import.meta.url).pathname;
const read = (n) => new Uint8Array(fs.readFileSync(path.join(FX, n)));

test(".eml mit PDF und eingebettetem Logo", async () => {
  const m = await parseMailFile("rechnung-mit-anhang.eml", read("rechnung-mit-anhang.eml"));
  assert.equal(m.subject, "Ihre Jahresabrechnung 2025 für Strom");
  assert.match(m.from, /Stadtwerke Musterstadt <rechnung@stadtwerke\.example>/);
  assert.equal(m.date.toISOString(), "2026-10-14T07:12:00.000Z");
  assert.match(m.text, /Jahresabrechnung für 2025/);
  const pdf = m.attachments.find((a) => a.kind === "pdf");
  const logo = m.attachments.find((a) => a.name === "logo.png");
  assert.ok(pdf && pdf.bytes.length > 100);
  assert.equal(logo.inline, true);
  assert.deepEqual(m.attachmentNames, ["Jahresabrechnung_2025.pdf"]);
});

test(".eml nur mit HTML: Text wird ohne Skripte übernommen", async () => {
  const m = await parseMailFile("ohne-anhang.eml", read("ohne-anhang.eml"));
  assert.match(m.text, /Kündigungsbestätigung/);
  assert.match(m.text, /31\.12\.2026/);
  assert.doesNotMatch(m.text, /<|script/);
  assert.equal(m.attachments.length, 0);
});

test(".eml mit zwei Anhängen unterschiedlicher Art", async () => {
  const m = await parseMailFile("zwei-anhaenge.eml", read("zwei-anhaenge.eml"));
  assert.deepEqual(m.attachments.map((a) => a.kind), ["pdf", "file"]);
});

// Outlook-Beispieldateien werden nicht im Repository mitgeliefert (fremde Daten).
// Wer welche hat, legt sie nach tests/fixtures/local/*.msg.
const LOCAL = path.join(FX, "local");
const msgs = fs.existsSync(LOCAL) ? fs.readdirSync(LOCAL).filter((f) => f.endsWith(".msg")) : [];
test(".msg-Dateien (lokal)", { skip: msgs.length ? false : "keine lokalen .msg-Beispiele" }, async () => {
  for (const f of msgs) {
    const m = await parseMailFile(f, new Uint8Array(fs.readFileSync(path.join(LOCAL, f))));
    assert.ok(m.subject !== undefined && Array.isArray(m.attachments), f);
  }
});
