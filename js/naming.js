// Dateinamen nach dem Schema JJJJ-MM-TT_Absender_Dokumenttyp_Titel.pdf

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

export function buildFileName({ date, sender, doctypeShort, title }) {
  const parts = [
    isValidIsoDate(date) ? date : todayIso(),
    cleanPart(sender, 30) || "Unbekannt",
    cleanPart(doctypeShort, 20) || "Info",
    cleanPart(title, 60) || "Dokument",
  ];
  return parts.join("_") + ".pdf";
}

export function withSuffix(fileName, n) {
  return fileName.replace(/\.pdf$/i, "") + `-${n}.pdf`;
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
