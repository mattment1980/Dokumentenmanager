// Dateinamen: Schema, Bereinigung, Dubletten
import test from "node:test";
import assert from "node:assert/strict";
import { buildFileName, cleanPart, isValidIsoDate, withSuffix, cleanFolderName } from "../../js/documents/naming.js";

test("Schema JJJJ-MM-TT_Absender_Typ_Titel.pdf", () => {
  assert.equal(
    buildFileName({ date: "2026-10-14", sender: "Finanzamt Musterstadt", doctypeShort: "Bescheid", title: "Einkommensteuer 2025" }),
    "2026-10-14_Finanzamt-Musterstadt_Bescheid_Einkommensteuer-2025.pdf",
  );
});

test("Andere Endung für Originaldateien", () => {
  assert.equal(buildFileName({ date: "2026-01-02", sender: "A", doctypeShort: "Info", title: "B", ext: "DOCX" }), "2026-01-02_A_Info_B.docx");
});

test("Platzhalter bei fehlenden Angaben", () => {
  assert.match(buildFileName({ date: "kaputt", sender: "", doctypeShort: "", title: "" }), /^\d{4}-\d{2}-\d{2}_Unbekannt_Info_Dokument\.pdf$/);
});

test("Verbotene Zeichen und Unterstriche werden ersetzt, Umlaute bleiben", () => {
  assert.equal(cleanPart('AOK Bayern / Die "Gesundheitskasse": Beitrag_2027?'), "AOK-Bayern-Die-Gesundheitskasse-Beitrag-2027");
  assert.equal(cleanPart("Müller & Söhne GmbH"), "Müller-Söhne-GmbH");
});

test("Datumsprüfung", () => {
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("2024-02-29"), true);
});

test("Dubletten-Suffix vor der Endung", () => {
  assert.equal(withSuffix("a_b.pdf", 2), "a_b-2.pdf");
  assert.equal(withSuffix("a_b.docx", 3), "a_b-3.docx");
  assert.equal(withSuffix("ohne", 2), "ohne-2");
});

test("Ordnernamen", () => {
  assert.equal(cleanFolderName(" 03_Versicherungen / Kfz. "), "03_Versicherungen Kfz");
});
