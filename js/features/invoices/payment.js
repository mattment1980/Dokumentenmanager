/**
 * Zahlungsangaben: IBAN prüfen und formatieren, Beträge lesen und anzeigen, Fälligkeit.
 * Reine Funktionen ohne Oberfläche – in tests/unit/payment.test.mjs abgedeckt.
 */

/** IBAN ohne Leerzeichen, in Großbuchstaben. */
export function normalizeIban(s) {
  return String(s || "").replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Prüft eine IBAN über ihre Prüfziffer (ISO 13616, Modulo 97).
 * Erkennt praktisch jeden Lese- oder Tippfehler bei einzelnen Ziffern.
 */
export function isValidIban(s) {
  const iban = normalizeIban(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/** "DE89370400440532013000" → "DE89 3704 0044 0532 0130 00" */
export function formatIban(s) {
  return normalizeIban(s).replace(/(.{4})/g, "$1 ").trim();
}

// Allgemeine Helfer für Beträge und Daten liegen in documents/values.js (auch von anderen Modulen genutzt).
export { parseAmount, formatAmount, plainAmount, isoToDe, daysUntil } from "../../documents/values.js";
import { daysUntil } from "../../documents/values.js";

/** Text zur Fälligkeit, z. B. "fällig in 5 Tagen", "heute fällig", "seit 3 Tagen überfällig". */
export function dueText(iso, today = new Date()) {
  const n = daysUntil(iso, today);
  if (n === null) return "sofort fällig";
  if (n === 0) return "heute fällig";
  if (n === 1) return "morgen fällig";
  if (n > 1) return `fällig in ${n} Tagen`;
  return n === -1 ? "seit gestern überfällig" : `seit ${-n} Tagen überfällig`;
}

/**
 * Schlüssel für "derselbe Zahlungsempfänger": Kleinbuchstaben, ohne Rechtsform und Sonderzeichen.
 * "Stadtwerke Musterstadt GmbH" und "stadtwerke musterstadt" ergeben denselben Schlüssel.
 */
export function payeeKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(gmbh|ag|kg|ohg|ug|e\.?\s?v|mbh|co|se|haftungsbeschrankt|& co)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Fügt einen Zusatz vor der Dateiendung ein: "a_b.pdf" + "bezahlt" → "a_b_bezahlt.pdf" */
export function withNameTag(fileName, tag) {
  const m = String(fileName).match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  if (m[1].toLowerCase().endsWith("_" + tag.toLowerCase())) return fileName;
  return `${m[1]}_${tag}${m[2] || ""}`;
}
