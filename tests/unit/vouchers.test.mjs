// Gutscheine und Pakete: Konfiguration ergänzen, Gültigkeit, Fristen, Sortierung
import test from "node:test";
import assert from "node:assert/strict";
import * as V from "../../js/features/vouchers/model.js";
import * as P from "../../js/features/parcels/model.js";
import { nextNumberedFolder } from "../../js/documents/naming.js";
import { shortDateDe } from "../../js/documents/values.js";

const base = () => ({
  folders: ["00_Eingang", "01_Banken", "13_Anschaffungen", "14_Kinder"].map((name) => ({ name, children: [] })),
  doctypes: [{ name: "Rechnung" }, { name: "Information/Sonstiges" }],
});
const day = (iso) => new Date(iso + "T12:00:00");

test("Neuer Hauptordner wird fortlaufend nummeriert", () => {
  assert.equal(nextNumberedFolder(["00_Eingang", "14_Kinder", "09_Immobilien"], "Gutscheine"), "15_Gutscheine");
  assert.equal(nextNumberedFolder(["Eingang", "Steuern"], "Gutscheine"), "Gutscheine");
  assert.equal(nextNumberedFolder(["001_A", "007_B"], "Gutscheine"), "008_Gutscheine");
});

test("Gutscheine: Konfiguration wird einmalig ergänzt", () => {
  const st = base();
  assert.ok(V.needsSetup(st));
  const r = V.setupStructure(st);
  assert.deepEqual(r.ensure, [["15_Gutscheine"], ["15_Gutscheine", "Verbraucht"]]);
  assert.equal(st.folders.at(-1).name, "15_Gutscheine");
  assert.equal(st.folders.at(-1).feature, "vouchers");
  assert.deepEqual(st.doctypes.map((d) => d.name), ["Rechnung", "Gutschein/Rabatt", "Information/Sonstiges"], "vor dem Auffangtyp");
  assert.equal(V.setupStructure(st), null, "zweiter Lauf ändert nichts");
  assert.ok(!V.needsSetup(st));
});

test("Gutscheine: vorhandener Ordner und Typ werden übernommen, nicht verdoppelt", () => {
  const st = base();
  st.folders.push({ name: "15_Gutscheine", children: [] });
  st.doctypes.splice(1, 0, { name: "Gutschein", short: "Gutschein" });
  const r = V.setupStructure(st);
  assert.deepEqual(r.ensure, []);
  assert.equal(st.folders.filter((f) => /Gutscheine/.test(f.name)).length, 1);
  assert.equal(V.findFolder(st).feature, "vouchers");
  assert.equal(V.folderName(st), "15_Gutscheine");
});

test("Gutscheine: Typ aus Version 2.2 wird auf Gutschein/Rabatt gebracht – nur wenn unverändert", () => {
  const st = base();
  st.folders.push({ name: "15_Gutscheine", children: [], feature: "vouchers" });
  st.doctypes.splice(1, 0, { name: "Gutschein", short: "Gutschein", hint: "Geschenkgutschein, Wertgutschein, Guthabenkarte, Gutscheincode", feature: "vouchers" });
  assert.ok(V.needsSetup(st));
  assert.ok(V.setupStructure(st));
  assert.equal(st.doctypes[1].name, "Gutschein/Rabatt");
  assert.match(st.doctypes[1].hint, /Rabatt/);
  assert.ok(!V.needsSetup(st));
  const own = base();
  own.folders.push({ name: "15_Gutscheine", children: [], feature: "vouchers" });
  own.doctypes.splice(1, 0, { name: "Gutschein", hint: "meine eigene Regel", feature: "vouchers" });
  assert.equal(V.setupStructure(own), null, "selbst angepasster Typ bleibt");
  assert.equal(own.doctypes[1].name, "Gutschein");
});

test("Gutscheine: Gültigkeit und Sortierung", () => {
  const t = day("2026-10-30");
  assert.equal(V.validityText("2026-11-19", t), "noch 20 Tage gültig");
  assert.equal(V.validityText("2026-10-30", t), "läuft heute ab");
  assert.equal(V.validityText("2026-10-27", t), "seit 3 Tagen abgelaufen");
  assert.equal(V.validityText("", t), "ohne Ablaufdatum");
  assert.equal(V.validityState("2026-11-29", t), "soon");
  assert.equal(V.validityState("2026-12-30", t), "ok");
  assert.equal(V.validityState("2026-10-29", t), "expired");
  const list = [{ validUntil: "", created: 1 }, { validUntil: "2027-01-01", created: 2 }, { validUntil: "2026-11-01", created: 3 }];
  assert.deepEqual([...list].sort(V.byExpiry).map((e) => e.created), [3, 2, 1]);
  const s = V.summarize([{ amount: 50, validUntil: "2026-11-10" }, { amount: null, validUntil: "2026-10-01" }, { kind: "discount", amount: 99, discount: "20 %" }], t);
  assert.deepEqual(s, { count: 3, discounts: 1, sum: 50, soon: 1, expired: 1 }, "Rabatte zählen nicht zur Summe");
});

test("Gutscheine: Restbetrag prüfen", () => {
  assert.deepEqual(V.checkRest("20,50", 50), { value: 20.5 });
  assert.deepEqual(V.checkRest("0", 50), { value: 0 });
  assert.ok(V.checkRest("60", 50).error);
  assert.ok(V.checkRest("abc", 50).error);
});

test("Pakete: Dokumenttyp ergänzen, Fristen, Kartenlink", () => {
  const st = base();
  assert.ok(P.setupStructure(st));
  assert.equal(st.doctypes[1].name, "Paketbenachrichtigung");
  assert.equal(P.setupStructure(st), null);
  const t = day("2026-10-30");
  assert.equal(shortDateDe("2026-11-07"), "Sa 07.11.");
  assert.equal(P.pickupText("2026-11-07", t), "bis Sa 07.11. · noch 8 Tage");
  assert.equal(P.pickupText("2026-10-31", t), "bis morgen (Sa 31.10.)");
  assert.equal(P.pickupState("2026-10-31", t), "urgent");
  assert.equal(P.pickupState("2026-10-29", t), "over");
  assert.equal(P.pickupText("", t), "Abholfrist unbekannt");
  assert.equal(P.needsPickup({ location: "" , address: "" }), false);
  assert.equal(P.statusText({ location: "", redelivery: "2026-10-31" }, t), "neuer Zustellversuch am Sa 31.10.");
  assert.equal(P.statusText({ location: "Postfiliale", until: "2026-10-31" }, t), "bis morgen (Sa 31.10.)");
  const old = base();
  old.doctypes.splice(1, 0, { name: "Paketbenachrichtigung", short: "Paket", hint: "Benachrichtigung über ein Paket zum Abholen (Filiale, Packstation, Paketshop, Nachbar)", feature: "parcels" });
  assert.ok(P.needsSetup(old));
  P.setupStructure(old);
  assert.match(old.doctypes[1].hint, /nicht angetroffen/);
  assert.ok(!P.needsSetup(old));
  assert.equal(P.mapsUrl("Postfiliale", "Hauptstr. 1, 12345 Musterstadt"), "https://www.google.com/maps/search/?api=1&query=Postfiliale%2C%20Hauptstr.%201%2C%2012345%20Musterstadt");
  assert.equal(P.mapsUrl("", ""), "");
  assert.equal(P.jpegDataUrl(new Uint8Array([255, 216])), "data:image/jpeg;base64,/9g=");
});
