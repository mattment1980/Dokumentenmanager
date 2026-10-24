/**
 * Register der offenen Rechnungen – eine JSON-Datei im Archivordner, damit alle Nutzer
 * des Archivs (z. B. beide Ehepartner) dieselbe Liste sehen.
 *
 * Datei: <Archiv>/_Offene-Rechnungen.json
 *   {
 *     version: 1,
 *     open: [Eintrag],                          offene Rechnungen
 *     knownIbans: { "<payeeKey>": ["DE…"] }      bisher gesehene IBANs je Empfänger (Betrugsschutz)
 *   }
 *
 * Eintrag:
 *   { id, created, createdBy, doctype, sender, title, recipient, iban, amount, purpose, due,
 *     ibanWarning, file: { driveId, id, name, webUrl }, targetRel: [...], targetFileName, description }
 *
 * Gleichzeitige Änderungen von zwei Geräten: update() liest die Datei samt Versionskennung,
 * ändert sie und schreibt nur, wenn sie zwischenzeitlich unverändert ist – sonst neuer Versuch.
 * Auf dem Gerät liegt eine Kopie für die Anzeige ohne Netz.
 */
import { S } from "../../core/state.js";
import { emit } from "../../core/events.js";
import { settings } from "../../services/storage.js";
import * as od from "../../services/onedrive.js";
import { payeeKey, normalizeIban } from "./payment.js";

export const REGISTER_FILE = "_Offene-Rechnungen.json";
const CACHE_KEY = "invoices";

const empty = () => ({ version: 1, open: [], knownIbans: {} });

function normalize(d) {
  const x = d && typeof d === "object" ? d : {};
  return {
    version: 1,
    open: Array.isArray(x.open) ? x.open : [],
    knownIbans: x.knownIbans && typeof x.knownIbans === "object" ? x.knownIbans : {},
  };
}

const sameArchive = (a, b) => JSON.stringify([a?.mode, a?.path, a?.driveId, a?.itemId]) === JSON.stringify([b?.mode, b?.path, b?.driveId, b?.itemId]);

let cache = normalize(settings.get(CACHE_KEY, null));

/** Aktueller Stand (lokale Kopie, sofort verfügbar). */
export function current() {
  return cache;
}

function setCache(d) {
  cache = d;
  settings.set(CACHE_KEY, d);
  emit("invoices:changed", d);
}

/** Neu aus OneDrive laden (aktives Archiv). Fehler werden still ignoriert (Anzeige bleibt beim Stand vorher). */
export async function refresh() {
  try {
    const { data } = await od.readJsonMeta([REGISTER_FILE]);
    setCache(normalize(data));
  } catch (e) {
    if (!(e instanceof od.AuthNeeded)) console.warn("Rechnungsliste nicht geladen", e);
  }
  return cache;
}

/** Nach einem Archivwechsel: alte Liste verwerfen und neu laden. */
export async function reset() {
  setCache(empty());
  return refresh();
}

/**
 * Ändert das Register konfliktsicher.
 * @param {(d) => void} change  verändert d direkt
 * @param {object} [archive]    Ziel-Archiv (Standard: aktives Archiv)
 */
export async function update(change, archive = S.archive) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, eTag } = await od.readJsonMeta([REGISTER_FILE], { archive });
    const d = normalize(data);
    change(d);
    try {
      await od.writeJson([REGISTER_FILE], d, { ifMatch: eTag, archive });
      if (sameArchive(archive, S.archive)) setCache(d);
      return d;
    } catch (e) {
      if (e instanceof od.Conflict) continue; // jemand anderes hat gleichzeitig geändert → neu lesen
      throw e;
    }
  }
  throw new Error("Die Rechnungsliste wird gerade von einem anderen Gerät geändert. Bitte gleich nochmal versuchen.");
}

/** IBAN für einen Empfänger merken (bis zu 5 je Empfänger). */
export function rememberIban(d, payee, iban) {
  const k = payeeKey(payee);
  const v = normalizeIban(iban);
  if (!k || !v) return;
  const list = d.knownIbans[k] || [];
  if (!list.includes(v)) d.knownIbans[k] = [...list, v].slice(-5);
}

/**
 * Prüft, ob eine IBAN für diesen Empfänger neu ist.
 * @returns {string[]|null}  bisher bekannte IBANs, wenn die neue davon abweicht; sonst null
 */
export function ibanChange(payee, iban, d = cache) {
  const known = d.knownIbans[payeeKey(payee)];
  const v = normalizeIban(iban);
  if (!known?.length || !v || known.includes(v)) return null;
  return known;
}

/** Offene Einträge desselben Empfängers (für den Mahnungs-Hinweis). */
export function openForPayee(payee, d = cache) {
  const k = payeeKey(payee);
  return k ? d.open.filter((e) => payeeKey(e.recipient) === k || payeeKey(e.sender) === k) : [];
}
