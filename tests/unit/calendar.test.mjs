// Kalender: welche Typen fragen, KI-Termine übernehmen, prüfen, Google-Termin bauen
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../js/features/calendar/model.js";

test("Kalender-Abfrage je Dokumenttyp: Standard und Merkmal", () => {
  assert.equal(C.asksCalendar({ name: "Bescheid" }), true);
  assert.equal(C.asksCalendar({ name: "Termin/Einladung" }), true);
  assert.equal(C.asksCalendar({ name: "Rechnung" }), false);
  assert.equal(C.asksCalendar({ name: "Mahnung" }), false);
  assert.equal(C.asksCalendar({ name: "Gutschein/Rabatt", feature: "vouchers" }), false);
  assert.equal(C.asksCalendar({ name: "Paketbenachrichtigung", feature: "parcels" }), false);
  assert.equal(C.asksCalendar({ name: "Rechnung", calendar: true }), true, "Merkmal schlägt Standard");
  assert.equal(C.asksCalendar({ name: "Bescheid", calendar: false }), false);
  assert.equal(C.asksCalendar(undefined), false);
});

test("KI-Termine: vergangene und ungültige fallen weg, Fristen ganztägig", () => {
  const items = C.fromAi(
    [
      { art: "termin", titel: " Zahnarzt ", datum: "2026-11-25", beginn: "10:30", ende: "10:00", ort: "Hauptstr. 5" },
      { art: "frist", titel: "Einspruch", datum: "2026-12-14", beginn: "12:00", berechnet: true, grundlage: "ein Monat" },
      { art: "termin", titel: "Ohne Uhrzeit", datum: "2026-12-01", beginn: "25:00" },
      { art: "termin", titel: "Vergangen", datum: "2026-11-01", beginn: "09:00" },
      { art: "termin", titel: "Kaputt", datum: "2026-02-30" },
    ],
    { today: "2026-11-13", reminderDays: 5 }
  );
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].title, items[0].allDay, items[0].start, items[0].end, items[0].reminderDays], ["Zahnarzt", false, "10:30", "", 5]);
  assert.deepEqual([items[1].kind, items[1].allDay, items[1].computed, items[1].basis], ["frist", true, true, "ein Monat"]);
  assert.equal(items[2].allDay, true, "ungültige Uhrzeit → ganztägig");
  assert.deepEqual(C.fromAi(null), []);
});

test("Eintrag prüfen", () => {
  const ok = { ...C.blankItem(), title: "X", date: "2026-11-20", allDay: false, start: "09:00", end: "10:00" };
  assert.equal(C.checkItem(ok), "");
  assert.match(C.checkItem({ ...ok, title: " " }), /Titel/);
  assert.match(C.checkItem({ ...ok, date: "" }), /Datum/);
  assert.match(C.checkItem({ ...ok, start: "" }), /Uhrzeit/);
  assert.match(C.checkItem({ ...ok, end: "08:00" }), /Ende/);
  assert.equal(C.checkItem({ ...ok, allDay: true, start: "" }), "");
});

test("Hilfsrechnungen: Uhrzeit, Folgetag, Erinnerung, Titel, ID", () => {
  assert.equal(C.addMinutes("10:30", 60), "11:30");
  assert.equal(C.addMinutes("23:30", 60), "23:59");
  assert.equal(C.nextDay("2026-12-31"), "2027-01-01");
  assert.equal(C.nextDay("2028-02-28"), "2028-02-29");
  assert.equal(C.reminderMinutes(3, false), 4320);
  assert.equal(C.reminderMinutes(0, false), 60);
  assert.equal(C.reminderMinutes(3, true), 3 * 1440 - 540, "ganztägig: 9:00 Uhr drei Tage vorher");
  assert.equal(C.reminderMinutes(0, true), 0);
  assert.equal(C.summaryOf({ kind: "frist", title: "Einspruch" }), "Frist: Einspruch");
  assert.equal(C.summaryOf({ kind: "frist", title: "Frist Antrag" }), "Frist Antrag");
  assert.equal(C.summaryOf({ kind: "termin", title: "Arzt" }), "Arzt");
  const id = C.eventId("q1abc-XY", 2);
  assert.match(id, /^[0-9a-v]{5,}$/, "nur base32hex-Zeichen");
  assert.equal(id, C.eventId("q1abc-XY", 2), "gleiche Eingabe, gleiche ID");
  assert.notEqual(id, C.eventId("q1abc-XY", 1));
});

test("Google-Termin: mit Uhrzeit und ganztägig", () => {
  const timed = C.eventBody(
    { ...C.blankItem(7), title: "Zahnarzt", date: "2026-11-25", start: "10:30", location: "Praxis", comment: "Bonusheft" },
    { docTitle: "Kontrolltermin", webUrl: "https://onedrive.live.com/x", by: "Matthias", timeZone: "Europe/Berlin", id: "dmabc0" }
  );
  assert.deepEqual(timed.start, { dateTime: "2026-11-25T10:30:00", timeZone: "Europe/Berlin" });
  assert.deepEqual(timed.end, { dateTime: "2026-11-25T11:30:00", timeZone: "Europe/Berlin" });
  assert.equal(timed.id, "dmabc0");
  assert.equal(timed.location, "Praxis");
  assert.deepEqual(timed.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 7 * 1440 }] });
  assert.match(timed.description, /^Bonusheft\n/);
  assert.match(timed.description, /Dokument: Kontrolltermin\nhttps:\/\/onedrive\.live\.com\/x\nEingetragen von Matthias/);
  const allDay = C.eventBody({ ...C.blankItem(), kind: "frist", title: "Einspruch", date: "2026-12-14", allDay: true, computed: true, basis: "ein Monat" }, {});
  assert.deepEqual([allDay.start, allDay.end, allDay.summary, allDay.transparency], [{ date: "2026-12-14" }, { date: "2026-12-15" }, "Frist: Einspruch", "transparent"]);
  assert.match(allDay.description, /berechnet – bitte prüfen: ein Monat/);
  assert.equal(allDay.location, undefined);
});
