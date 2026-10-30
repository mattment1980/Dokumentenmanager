/**
 * Paketbenachrichtigungen – reine Funktionen ohne Oberfläche (in tests/unit/parcels.test.mjs abgedeckt).
 */
import { daysUntil, shortDateDe } from "../../documents/values.js";

export const FEATURE = "parcels";
export const SUBFOLDER = "Paketbenachrichtigungen";

export const DOCTYPE = {
  name: "Paketbenachrichtigung",
  short: "Paket",
  hint:
    "Benachrichtigungskarte eines Paketdienstes: Empfänger nicht angetroffen, Zustellversuch fehlgeschlagen, " +
    "Paket zum Abholen (Filiale, Packstation, Paketshop), beim Nachbarn abgegeben oder neuer Zustellversuch",
  feature: FEATURE,
};
/** Beschreibung aus Version 2.2 – wird beim Start ersetzt, solange sie unverändert ist. */
const LEGACY_HINT = "Benachrichtigung über ein Paket zum Abholen (Filiale, Packstation, Paketshop, Nachbar)";

export const findDoctype = (st) =>
  st.doctypes.find((d) => d.feature === FEATURE) || st.doctypes.find((d) => /^paket/i.test(d.name));

export const isParcelType = (st, doctypeName) => {
  const dt = findDoctype(st);
  return !!dt && dt.name === doctypeName;
};

/** Dokumenttyp ergänzen, falls er fehlt (vor dem letzten Typ, dem Auffangtyp der KI). */
export function setupStructure(st) {
  const dt = findDoctype(st);
  if (!dt) {
    st.doctypes.splice(Math.max(0, st.doctypes.length - 1), 0, { ...DOCTYPE });
    return { ensure: [] };
  }
  let changed = false;
  if (dt.feature !== FEATURE) {
    dt.feature = FEATURE;
    changed = true;
  }
  if ((dt.hint || "") === LEGACY_HINT) {
    dt.hint = DOCTYPE.hint;
    changed = true;
  }
  return changed ? { ensure: [] } : null;
}

export const needsSetup = (st) => {
  const dt = findDoctype(st);
  return !dt || dt.feature !== FEATURE || (dt.hint || "") === LEGACY_HINT;
};

/** Muss man das Paket irgendwo abholen? Ohne Abholort: nur ein neuer Zustellversuch angekündigt. */
export const needsPickup = (e) => !!String(e?.location || "").trim() || !!String(e?.address || "").trim();

/** Statuszeile für Box und Detail. */
export function statusText(e, today = new Date()) {
  if (!needsPickup(e)) return e.redelivery ? `neuer Zustellversuch am ${shortDateDe(e.redelivery)}` : "neuer Zustellversuch";
  return pickupText(e.until, today);
}

/** Frist als Text: "abholbar bis Sa 07.11. · noch 3 Tage", "heute letzter Tag", "Frist abgelaufen" */
export function pickupText(iso, today = new Date()) {
  const n = daysUntil(iso, today);
  if (n === null) return "Abholfrist unbekannt";
  const d = shortDateDe(iso);
  if (n < 0) return `Frist abgelaufen (${d})`;
  if (n === 0) return `heute letzter Tag (${d})`;
  if (n === 1) return `bis morgen (${d})`;
  return `bis ${d} · noch ${n} Tage`;
}

/** Zustand der Frist: "over" (abgelaufen), "urgent" (heute/morgen), "ok" */
export function pickupState(iso, today = new Date()) {
  const n = daysUntil(iso, today);
  if (n === null) return "ok";
  if (n < 0) return "over";
  return n <= 1 ? "urgent" : "ok";
}

/** Zuerst die mit der knappsten Frist. */
export const byDeadline = (a, b) => (a.until || "9999").localeCompare(b.until || "9999") || a.created - b.created;

/** Link zur Kartensuche nach dem Abholort. */
export function mapsUrl(location, address) {
  const q = [location, address].map((s) => String(s || "").trim()).filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}

/** Bytes → data:-URL (für das Vorschaubild in der Liste). */
export function jpegDataUrl(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return "data:image/jpeg;base64," + btoa(s);
}
