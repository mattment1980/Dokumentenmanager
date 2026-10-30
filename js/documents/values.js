/**
 * Beträge und Daten lesen und anzeigen – von mehreren Funktionsmodulen genutzt
 * (Rechnungen, Gutscheine, Pakete). Reine Funktionen, in tests/unit/payment.test.mjs und
 * tests/unit/values.test.mjs abgedeckt.
 */

/**
 * Betrag aus deutscher oder englischer Schreibweise: "1.234,56" · "1234,5" · "12.50" · "€ 99"
 * @returns {number|null}
 */
export function parseAmount(s) {
  if (typeof s === "number") return Number.isFinite(s) ? Math.round(s * 100) / 100 : null;
  let t = String(s || "").replace(/[€\s]|EUR/gi, "");
  if (!t) return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}(\.|$)/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** 1234.5 → "1.234,50 €" */
export function formatAmount(n) {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/** 1234.5 → "1234,50" (zum Einfügen ins Banking) */
export function plainAmount(n) {
  return Number(n).toFixed(2).replace(".", ",");
}

/** "2026-11-01" → "01.11.2026" */
export function isoToDe(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Tage bis zur Fälligkeit (negativ = überfällig); null ohne Datum. */
export function daysUntil(iso, today = new Date()) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const due = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86400000);
}


const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "2026-11-07" → "Sa 07.11." (kurz, mit Wochentag – z. B. für Abholfristen) */
export function shortDateDe(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${WEEKDAYS[wd]} ${m[3]}.${m[2]}.`;
}
