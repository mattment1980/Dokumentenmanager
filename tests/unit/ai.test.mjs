// KI-Vorschlag: Absicherung gegen ungültige Antworten
import test from "node:test";
import assert from "node:assert/strict";
import { normalize, canSuggest } from "../../js/services/ai.js";
import { DEFAULT_STRUCTURE } from "../../js/core/config.js";

test("Unterordner werden unabhängig von Groß-/Kleinschreibung erkannt", () => {
  const n = normalize({ folder: "05_Gesundheit", subfolder: "person 2", doctype: "Rechnung", sender: "Dr. Huber", title: "x", letter_date: "2026-09-01", confidence: 0.9, reason: "" }, DEFAULT_STRUCTURE);
  assert.equal(n.subfolder, "Person 2");
  assert.equal(n.date, "2026-09-01");
});

test("Unbekannte Werte fallen auf sichere Standards zurück", () => {
  const n = normalize({ folder: "Quatsch", subfolder: "", doctype: "??", sender: "a", title: "b", letter_date: "heute" }, DEFAULT_STRUCTURE);
  assert.equal(n.folder, "00_Eingang");
  assert.equal(n.doctype, "Information/Sonstiges");
  assert.equal(n.date, "");
});

test("Ohne Eingaben kein Vorschlag möglich", () => {
  assert.equal(canSuggest({}), false);
  assert.equal(canSuggest({ text: "Hallo" }), true);
});
