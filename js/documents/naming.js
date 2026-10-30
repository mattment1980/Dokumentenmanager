/**
 * Dateinamen nach dem Schema JJJJ-MM-TT_Absender_Dokumenttyp_Titel.<endung>
 * (z. B. 2026-10-14_Finanzamt_Bescheid_Einkommensteuer-2025.pdf)
 *
 * Reine Funktionen ohne Seiteneffekte – in tests/unit/naming.test.mjs abgedeckt.
 */

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isValidIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900 && y <= 2100;
}

// Bereinigt einen Namensteil: keine in OneDrive verbotenen Zeichen, Leerzeichen zu Bindestrichen,
// keine Unterstriche (die trennen die Namensteile), Umlaute bleiben erhalten.
export function cleanPart(s, maxLen = 60) {
  let out = String(s || "")
    .normalize("NFC")
    .replace(/["*:<>?\/\\|#%~&{}+]/g, " ")
    .replace(/_/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (out.length > maxLen) out = out.slice(0, maxLen).replace(/[-.]+$/g, "");
  return out;
}

export function buildFileName({ date, sender, doctypeShort, title, ext = "pdf" }) {
  const e = String(ext || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const parts = [
    isValidIsoDate(date) ? date : todayIso(),
    cleanPart(sender, 30) || "Unbekannt",
    cleanPart(doctypeShort, 20) || "Info",
    cleanPart(title, 60) || "Dokument",
  ];
  return parts.join("_") + "." + e;
}

/** Hängt "-n" vor der Dateiendung an: a_b.pdf → a_b-2.pdf */
export function withSuffix(fileName, n) {
  const m = String(fileName).match(/^(.*?)(\.[A-Za-z0-9]{1,8})?$/);
  return `${m[1]}-${n}${m[2] || ""}`;
}

// Ordnernamen für OneDrive prüfen (beim Bearbeiten der Struktur).
export function cleanFolderName(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/["*:<>?\/\\|#%]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "")
    .slice(0, 80);
}

/**
 * Name für einen neuen Hauptordner, fortlaufend nummeriert wie die vorhandenen:
 * ["00_Eingang", …, "14_Kinder"] + "Gutscheine" → "15_Gutscheine".
 * Sind die vorhandenen Ordner nicht nummeriert, bleibt der Name ohne Nummer.
 */
export function nextNumberedFolder(existing, base) {
  const nums = existing.map((n) => String(n).match(/^(\d+)_/)).filter(Boolean);
  if (!nums.length) return cleanFolderName(base);
  const width = Math.max(...nums.map((m) => m[1].length));
  const next = Math.max(...nums.map((m) => Number(m[1]))) + 1;
  return `${String(next).padStart(width, "0")}_${cleanFolderName(base)}`;
}
