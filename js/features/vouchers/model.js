/**
 * Gutscheine und Rabatte – reine Funktionen ohne Oberfläche (in tests/unit/vouchers.test.mjs abgedeckt):
 * Erkennen von Dokumenttyp und Ordner, Ergänzen der Konfiguration, Gültigkeit, Sortierung.
 */
import { nextNumberedFolder } from "../../documents/naming.js";
import { daysUntil, parseAmount } from "../../documents/values.js";

export const FEATURE = "vouchers";
export const USED_FOLDER = "Verbraucht";
/** Ab so vielen Tagen vor Ablauf wird ein Gutschein hervorgehoben. */
export const SOON_DAYS = 30;

export const DOCTYPE = {
  name: "Gutschein/Rabatt",
  short: "Gutschein",
  hint: "Geschenkgutschein, Wertgutschein, Guthabenkarte, Gutscheincode, Rabattcode, Rabattaktion, Coupon",
  feature: FEATURE,
};
/** Fassung aus Version 2.2 – wird beim Start auf die aktuelle gebracht, solange sie unverändert ist. */
const LEGACY_DOCTYPE = { name: "Gutschein", hint: "Geschenkgutschein, Wertgutschein, Guthabenkarte, Gutscheincode" };

/** Art: Gutschein (Geldwert oder Leistung) oder Rabatt (Prozent/Betrag auf etwas) */
export const KINDS = [
  ["voucher", "Gutschein"],
  ["discount", "Rabatt"],
];
export const isDiscount = (e) => e?.kind === "discount";
/** Kürzel im Dateinamen für Rabatte (Gutscheine nutzen das Kürzel des Dokumenttyps) */
export const DISCOUNT_SHORT = "Rabatt";
const FOLDER_BASE = "Gutscheine";
const FOLDER_DESCRIPTION =
  "Offene Gutscheine und Rabatte (werden automatisch hier abgelegt). Eingelöste und abgelaufene liegen im Unterordner Verbraucht.";

export const REDEEM = [
  ["online", "Online"],
  ["store", "Vor Ort"],
  ["both", "Beides"],
];
export const redeemLabel = (v) => REDEEM.find((r) => r[0] === v)?.[1] || "";

/** Dokumenttyp des Moduls (Merkmal feature, sonst nach Name). */
export const findDoctype = (st) =>
  st.doctypes.find((d) => d.feature === FEATURE) || st.doctypes.find((d) => /^gutschein/i.test(d.name));

/** Hauptordner des Moduls (Merkmal feature, sonst „15_Gutscheine“ bzw. „Gutscheine“). */
export const findFolder = (st) =>
  st.folders.find((f) => f.feature === FEATURE) || st.folders.find((f) => /^(\d+_)?gutscheine$/i.test(f.name));

export const isVoucherType = (st, doctypeName) => {
  const dt = findDoctype(st);
  return !!dt && dt.name === doctypeName;
};

/** Name des Gutscheinordners (auch wenn er noch nicht in der Konfiguration steht). */
export const folderName = (st) => findFolder(st)?.name || nextNumberedFolder(st.folders.map((f) => f.name), FOLDER_BASE);

/**
 * Ergänzt die Konfiguration um Dokumenttyp und Hauptordner, falls sie fehlen.
 * Der Dokumenttyp kommt vor den letzten Typ (Information/Sonstiges bleibt der Auffangtyp der KI).
 * @returns {{ ensure: string[][] } | null}  null = nichts zu tun; sonst anzulegende Ordner
 */
export function setupStructure(st) {
  let changed = false;
  const ensure = [];
  const dt = findDoctype(st);
  if (!dt) {
    st.doctypes.splice(Math.max(0, st.doctypes.length - 1), 0, { ...DOCTYPE });
    changed = true;
  } else {
    if (dt.feature !== FEATURE) {
      dt.feature = FEATURE;
      changed = true;
    }
    if (isLegacy(dt)) {
      Object.assign(dt, { name: DOCTYPE.name, hint: DOCTYPE.hint });
      changed = true;
    }
  }
  let f = findFolder(st);
  if (!f) {
    f = { name: folderName(st), description: FOLDER_DESCRIPTION, children: [], feature: FEATURE };
    st.folders.push(f);
    ensure.push([f.name], [f.name, USED_FOLDER]);
    changed = true;
  } else if (f.feature !== FEATURE) {
    f.feature = FEATURE;
    changed = true;
  }
  return changed ? { ensure } : null;
}

// Unverändert aus 2.2 übernommener Typ: Name und Beschreibung auf die Fassung mit Rabatten bringen.
// Hat jemand den Typ selbst umbenannt oder die Beschreibung geändert, bleibt er, wie er ist.
const isLegacy = (dt) => dt.name === LEGACY_DOCTYPE.name && (dt.hint || "") === LEGACY_DOCTYPE.hint;

/** Fehlt etwas in der Konfiguration? (ohne sie zu ändern) */
export const needsSetup = (st) => {
  const d = findDoctype(st);
  const f = findFolder(st);
  return !d || !f || d.feature !== FEATURE || f.feature !== FEATURE || isLegacy(d);
};

/** Gültigkeit als Text: "gültig bis 31.12.2026 · noch 12 Tage", "abgelaufen seit 3 Tagen" … */
export function validityText(iso, today = new Date()) {
  const n = daysUntil(iso, today);
  if (n === null) return "ohne Ablaufdatum";
  if (n < 0) return n === -1 ? "seit gestern abgelaufen" : `seit ${-n} Tagen abgelaufen`;
  if (n === 0) return "läuft heute ab";
  if (n === 1) return "läuft morgen ab";
  return `noch ${n} Tage gültig`;
}

/** Zustand: "expired" | "soon" | "ok" */
export function validityState(iso, today = new Date()) {
  const n = daysUntil(iso, today);
  if (n === null) return "ok";
  if (n < 0) return "expired";
  return n <= SOON_DAYS ? "soon" : "ok";
}

/** Sortierung der Liste: zuerst die, die am frühesten ablaufen; ohne Datum ans Ende. */
export const byExpiry = (a, b) => (a.validUntil || "9999").localeCompare(b.validUntil || "9999") || a.created - b.created;

/** Zusammenfassung für Kachel und Liste (Summe nur über Gutscheine mit Geldwert, nicht über Rabatte). */
export function summarize(list, today = new Date()) {
  return {
    count: list.length,
    discounts: list.filter(isDiscount).length,
    sum: list.reduce((s, e) => s + (isDiscount(e) ? 0 : Number(e.amount) || 0), 0),
    soon: list.filter((e) => validityState(e.validUntil, today) === "soon").length,
    expired: list.filter((e) => validityState(e.validUntil, today) === "expired").length,
  };
}

/** Restbetrag aus der Eingabe prüfen: Zahl ≥ 0 und kleiner als der bisherige Betrag. */
export function checkRest(input, before) {
  const n = parseAmount(input);
  if (n === null || n < 0) return { error: "Bitte den Restbetrag eingeben, z. B. 12,50." };
  if (before !== null && before !== undefined && n >= Number(before)) return { error: "Der Restbetrag muss kleiner sein als der bisherige Wert." };
  return { value: n };
}
