// Rechnungsmodul: IBAN-Prüfung, Beträge, Fälligkeit, Dateinamen-Vermerk
import test from "node:test";
import assert from "node:assert/strict";
import { isValidIban, formatIban, parseAmount, formatAmount, plainAmount, dueText, payeeKey, withNameTag } from "../../js/features/invoices/payment.js";

test("IBAN-Prüfziffer", () => {
  assert.equal(isValidIban("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(isValidIban("DE89370400440532013001"), false, "eine Ziffer falsch");
  assert.equal(isValidIban("DE8937040044053201300"), false, "eine Ziffer fehlt");
  assert.equal(isValidIban("GB82WEST12345698765432"), true);
  assert.equal(isValidIban(""), false);
  assert.equal(formatIban("de89370400440532013000"), "DE89 3704 0044 0532 0130 00");
});

test("Beträge in deutscher und englischer Schreibweise", () => {
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1234,5"), 1234.5);
  assert.equal(parseAmount("12.50"), 12.5);
  assert.equal(parseAmount("€ 99"), 99);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("1.000"), 1000);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(649.9), 649.9);
  assert.equal(formatAmount(1234.5).replace(/\s/g, " "), "1.234,50 €");
  assert.equal(plainAmount(649.9), "649,90");
});

test("Fälligkeit", () => {
  const today = new Date(2026, 9, 24);
  assert.equal(dueText("2026-10-24", today), "heute fällig");
  assert.equal(dueText("2026-10-29", today), "fällig in 5 Tagen");
  assert.equal(dueText("2026-10-20", today), "seit 4 Tagen überfällig");
  assert.equal(dueText("", today), "sofort fällig");
});

test("Gleicher Empfänger trotz Rechtsform und Schreibweise", () => {
  assert.equal(payeeKey("Elektro Muster GmbH"), payeeKey("elektro muster"));
  assert.equal(payeeKey("Stadtwerke Müsterstadt GmbH & Co. KG"), "stadtwerke musterstadt");
});

test("Vermerk im Dateinamen", () => {
  assert.equal(withNameTag("2026-10-20_A_Rechnung_B.pdf", "bezahlt"), "2026-10-20_A_Rechnung_B_bezahlt.pdf");
  assert.equal(withNameTag("x_bezahlt.pdf", "bezahlt"), "x_bezahlt.pdf", "nicht doppelt");
});
