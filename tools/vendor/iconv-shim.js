// Ersatz für iconv-lite im Browser: Dekodieren über die eingebaute TextDecoder-API.
module.exports = {
  decode(bytes, encoding) {
    let enc = String(encoding || "utf-8").toLowerCase();
    if (enc === "utf16le" || enc === "ucs2") enc = "utf-16le";
    try { return new TextDecoder(enc).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
  },
  encode() { throw new Error("Schreiben von MSG-Dateien wird nicht unterstützt"); },
  encodingExists(enc) { try { new TextDecoder(enc); return true; } catch { return false; } },
};
